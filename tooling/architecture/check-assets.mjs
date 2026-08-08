#!/usr/bin/env node
/**
 * 资源清单与检查（R3.3 增强版；spec §17）。
 *
 * 检查模式（默认）：
 * - JS/TS/CSS 中 /assets/ 与 url() 引用必须存在。
 * - 主题封面五套齐全（错误变体检测）。
 * - 重复大文件（采样 hash）。
 * 清单模式（--manifest）：生成 assets-manifest.json（相对路径，可重复）：
 *   id/path/format/size/hash/owner/themeVariants/source/license/preloadPolicy/fallback
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.ARCH_ROOT
  ? path.resolve(process.env.ARCH_ROOT)
  : path.resolve(scriptDir, '../..');
const publicDir = path.join(root, 'apps/web/public');
const manifestMode = process.argv.includes('--manifest');
const violations = [];
let checked = 0;

/** 扫描源码引用（JS/TS/CSS） */
function collectSourceFiles() {
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'public') continue;
      if (e.isDirectory()) walk(full);
      else if (/\.(css|js|mjs|cjs|ts|tsx)$/.test(e.name)) files.push(full);
    }
  };
  walk(path.join(root, 'apps/web/src'));
  walk(path.join(root, 'packages'));
  return files;
}

/** 收集全部源码资源引用（绝对 /assets/ 路径集） */
function collectReferences() {
  const refs = new Set();
  for (const f of collectSourceFiles()) {
    const srcText = fs.readFileSync(f, 'utf8');
    for (const m of srcText.matchAll(/['"](\/assets\/[^'"]+)['"]/g))
      refs.add(m[1].replace(/^\//, ''));
    if (f.endsWith('.css')) {
      for (const m of srcText.matchAll(/url\(\s*['"]?(\/assets\/[^'")]+)['"]?\s*\)/g)) {
        refs.add(m[1].replace(/^\//, ''));
      }
    }
  }
  return refs;
}

function referencesExist() {
  for (const f of collectSourceFiles()) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(root, f);
    // 字符串引用 /assets/...
    for (const m of src.matchAll(/['"](\/assets\/[^'"]+)['"]/g)) {
      checked += 1;
      if (!fs.existsSync(path.join(publicDir, m[1].replace(/^\//, '')))) {
        violations.push(`缺失资源: ${m[1]}（引用自 ${rel}）`);
      }
    }
    // CSS url() 引用
    if (f.endsWith('.css')) {
      for (const m of src.matchAll(/url\(\s*['"]?(\/assets\/[^'")]+)['"]?\s*\)/g)) {
        checked += 1;
        if (!fs.existsSync(path.join(publicDir, m[1].replace(/^\//, '')))) {
          violations.push(`缺失资源: ${m[1]}（CSS url 引用自 ${rel}）`);
        }
      }
    }
  }
}

function coversComplete() {
  const dir = path.join(publicDir, 'assets/subject-covers');
  if (!fs.existsSync(dir)) return;
  for (const subject of ['chemistry', 'math', 'physics', 'biology']) {
    for (let v = 1; v <= 5; v += 1) {
      const found = fs.readdirSync(dir).some((n) => n.startsWith(subject) && n.includes(`-v${v}`));
      if (!found) violations.push(`主题封面缺失: ${subject}-v${v}`);
    }
  }
}

function duplicates() {
  const seen = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(png|jpg|jpeg|webp)$/.test(e.name)) {
        const size = fs.statSync(full).size;
        if (size < 800 * 1024) continue;
        const fd = fs.openSync(full, 'r');
        const head = Buffer.alloc(64 * 1024);
        const tail = Buffer.alloc(64 * 1024);
        fs.readSync(fd, head, 0, head.length, 0);
        fs.readSync(fd, tail, 0, tail.length, Math.max(0, size - tail.length));
        fs.closeSync(fd);
        const hash = crypto
          .createHash('md5')
          .update(head)
          .update(tail)
          .update(String(size))
          .digest('hex');
        if (seen.has(hash)) {
          violations.push(`重复大文件: ${path.relative(root, full)} 与 ${seen.get(hash)} 相同`);
        } else {
          seen.set(hash, path.relative(root, full));
        }
      }
    }
  };
  walk(path.join(publicDir, 'assets'));
}

/** 收集资源条目（相对路径 + 稳定 owner/theme 推断；可重复） */
function collectAssetEntries() {
  const entries = [];
  const walk = (dir, relDir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.posix.join(relDir, e.name);
      if (e.isDirectory()) {
        walk(full, rel);
        continue;
      }
      if (!/\.(png|jpg|jpeg|webp|gif|svg|mp3|wav|json|glb|fbx)$/.test(e.name)) continue;
      const size = fs.statSync(full).size;
      const hash = crypto
        .createHash('sha256')
        .update(fs.readFileSync(full))
        .digest('hex')
        .slice(0, 16);
      const isCover = rel.includes('subject-covers');
      entries.push({
        id: rel,
        path: rel,
        format: path.extname(e.name).slice(1),
        size,
        hash,
        owner: rel.split('/')[1] || 'web',
        themeVariants: isCover ? [path.basename(rel).match(/v(\d)/)?.[1] || ''] : [],
        source: 'repo',
        license: 'unknown',
        preloadPolicy: 'lazy',
        fallback: null,
      });
    }
  };
  if (fs.existsSync(path.join(publicDir, 'assets'))) {
    walk(path.join(publicDir, 'assets'), 'assets');
  }
  return entries;
}

/** 生成可重复清单（相对路径 + 稳定 owner/theme 推断） */
function generateManifest() {
  const entries = collectAssetEntries();
  const manifestPath = path.join(root, 'docs/engineering/assets-manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString().slice(0, 10), count: entries.length, entries },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `[assets] manifest 已生成：${entries.length} 项 → ${path.relative(root, manifestPath)}`,
  );
}

if (manifestMode) {
  generateManifest();
  process.exit(0);
}

referencesExist();
coversComplete();
duplicates();

/**
 * 孤儿资源：manifest 登记但未被使用。
 * - 封面家族经 cover-urls.js 的 COVER_ASSET_STEM 登记（动态拼接引用）：
 *   stem 已登记 → 整族豁免（v1–v5 供五主题切换使用）。
 * - 非封面资源必须被源码静态引用。
 */
function registeredCoverStems() {
  // 登记数据源始终从脚本所在仓库读取（不受 ARCH_ROOT 影响，类似 rules.json）
  const repoRoot = path.resolve(scriptDir, '../..');
  const coverUrls = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/subjects/bookshelf/cover-urls.js'),
    'utf8',
  );
  const stems = new Set();
  for (const m of coverUrls.matchAll(/(\w+):\s*'(\w+)'/g)) {
    if (m[1] === 'physics' || m[1] === 'biology' || m[1] === 'chemistry' || m[1] === 'math') {
      stems.add(m[2]);
    }
  }
  return stems;
}

function orphans() {
  const manifestPath = path.join(root, 'docs/engineering/assets-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    violations.push('缺失 docs/engineering/assets-manifest.json（先运行 --manifest）');
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const refs = collectReferences();
  const coverStems = registeredCoverStems();
  for (const entry of manifest.entries || []) {
    const rel = entry.path.replace(/^assets\//, '');
    const referenced = refs.has(`assets/${rel}`) || refs.has(`/assets/${rel}`);
    const isCover = entry.path.includes('subject-covers');
    const stem = entry.path.match(/([\w-]+)-cover-v\d\.(?:png|jpg|webp)$/)?.[1];
    const coverRegistered = isCover && stem ? coverStems.has(stem) : false;
    if (!referenced && !coverRegistered) {
      violations.push(`孤儿资源: ${entry.path}（未被源码引用且封面家族未登记）`);
    }
  }
}

/**
 * manifest 漂移：已提交 manifest 与当前资源目录生成结果不一致。
 * 规范化比较字段：id/path/format/size/hash/themeVariants。
 *
 * 以下字段当前为固定默认值（source=repo, license=unknown, preloadPolicy=lazy,
 * fallback=null），且 generatedAt 每次生成都会变，故不参与漂移判断。
 */
function normalizeEntry(entry) {
  return {
    id: entry.id,
    path: entry.path,
    format: entry.format,
    size: entry.size,
    hash: entry.hash,
    themeVariants: Array.isArray(entry.themeVariants)
      ? [...entry.themeVariants].map(String).sort()
      : [],
  };
}

function manifestDrift() {
  const committedPath = path.join(root, 'docs/engineering/assets-manifest.json');
  if (!fs.existsSync(committedPath)) return;
  const committed = JSON.parse(fs.readFileSync(committedPath, 'utf8'));
  const entries = collectAssetEntries();
  const committedById = new Map((committed.entries || []).map((e) => [e.id, e]));
  const generatedById = new Map(entries.map((e) => [e.id, e]));

  for (const id of generatedById.keys()) {
    if (!committedById.has(id)) {
      violations.push(`manifest 漂移: 新资源未登记 ${id}（运行 --manifest 更新）`);
    }
  }
  for (const id of committedById.keys()) {
    if (!generatedById.has(id)) {
      violations.push(`manifest 漂移: 已删除资源仍登记 ${id}`);
    }
  }
  for (const [id, generated] of generatedById) {
    const committedEntry = committedById.get(id);
    if (!committedEntry) continue;
    const a = normalizeEntry(committedEntry);
    const b = normalizeEntry(generated);
    const fields = [];
    for (const key of ['path', 'format', 'size', 'hash', 'themeVariants']) {
      const av = JSON.stringify(a[key]);
      const bv = JSON.stringify(b[key]);
      if (av !== bv) fields.push(key);
    }
    if (fields.length) {
      const detail =
        fields.includes('hash') || fields.includes('size')
          ? 'hash 或 size 不一致'
          : fields.join('/');
      violations.push(`manifest 漂移: ${id} ${detail}`);
    }
  }
}

orphans();
manifestDrift();

if (violations.length) {
  console.error(`[assets] ${violations.length} 处资源问题：`);
  for (const v of violations.slice(0, 30)) console.error('  ' + v);
  process.exit(1);
}
console.log(`[assets] OK：${checked} 处资源引用有效，主题封面齐全，无重复大文件`);
