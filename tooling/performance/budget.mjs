#!/usr/bin/env node
/**
 * Bundle 性能预算（Task 8 重构版）。
 *
 * 从 Vite build manifest（dist/.vite/manifest.json）沿 imports 递归计算
 * 静态依赖闭包，报告三条路径的真实请求集合：
 *   - initial              ：index.html 入口闭包（entry + modulepreload + 首屏 CSS）
 *   - mathGraph            ：src/math/graph/index.js dynamic entry 相对 initial 新增
 *   - mathClassroomKatexOnly：src/math/classroom/entry.js 相对 initial 新增（KaTeX-only）
 *
 * 校验维度（node:zlib.gzipSync 计算每个 JS/CSS/字体资产的 gzip）：
 *   - 单 chunk / index 聚合 / total 的 raw + gzip 字节
 *   - 每条路径的 raw / gzip / 唯一请求数（maxAssetCount）
 *   - mathClassroomKatexOnly 禁止出现 jsxgraph（forbiddenChunks）
 *   - 与版本化拆分前 fixture（route-request-baseline.json）比较规范化请求集合：
 *     仅允许声明的 splitTransforms（mathviz → jsxgraph+katex），其余差异即违规
 *   - vendor 依赖（jsxgraph/katex/three）全仓只允许一个 chunk 文件（禁止重复进多个业务 chunk）
 *   - manifest 缺少预期 entry 必须硬失败，禁止回退到文件名猜测
 *
 * 用法：
 *   node tooling/performance/budget.mjs                 # 阈值 + baseline 比较
 *   node tooling/performance/budget.mjs --report-json <path>  # 只输出报告（基线捕获用）
 * 环境变量：ARCH_BUDGET_DIST（产物目录，fixture 用）、ARCH_BUDGET_BASELINE（baseline 路径）
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '../..');

const budget = JSON.parse(fs.readFileSync(path.join(scriptDir, 'budget.json'), 'utf8'));
const baselinePath = process.env.ARCH_BUDGET_BASELINE
  ? path.resolve(process.env.ARCH_BUDGET_BASELINE)
  : path.join(scriptDir, 'route-request-baseline.json');

const distDir = process.env.ARCH_BUDGET_DIST
  ? path.resolve(process.env.ARCH_BUDGET_DIST)
  : path.join(root, 'apps/web/dist');
const manifestPath = path.join(distDir, '.vite/manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(
    `[budget] 缺少 Vite manifest ${manifestPath}；先运行 npm run build -w @xiaohuang/web`,
  );
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

/** Files referenced by the current Vite manifest (stale hashed assets must be ignored). */
function activeFileSetFromManifest(man) {
  const files = new Set();
  for (const value of Object.values(man)) {
    if (!value || typeof value !== 'object') continue;
    if (typeof value.file === 'string') files.add(value.file);
    for (const css of value.css || []) {
      if (typeof css === 'string') files.add(css);
    }
    for (const asset of value.assets || []) {
      if (typeof asset === 'string') files.add(asset);
    }
  }
  return files;
}

const activeFiles = activeFileSetFromManifest(manifest);

const reportOnly = process.argv.includes('--report-json');
const reportArgIdx = process.argv.indexOf('--report-json');
const reportTarget = reportArgIdx >= 0 ? process.argv[reportArgIdx + 1] : null;
if (reportOnly && !reportTarget) {
  console.error('[budget] --report-json 需要输出路径参数');
  process.exit(1);
}

/** 文件相对 dist 的磁盘路径（manifest.file 为 assets/...） */
function diskPath(file) {
  return path.join(distDir, file);
}

/** raw kB（按磁盘字节） */
function rawKb(file) {
  return fs.statSync(diskPath(file)).size / 1024;
}

/** gzip kB */
function gzipKb(file) {
  const buf = fs.readFileSync(diskPath(file));
  return zlib.gzipSync(buf, { level: 9 }).length / 1024;
}

/** 资产类型 */
function kindOf(file) {
  if (file.endsWith('.js')) return 'js';
  if (file.endsWith('.css')) return 'css';
  return 'asset';
}

/** 去 hash 的规范化 chunk family（优先 manifest name，否则剥文件名哈希与扩展名） */
const HASH_RE = /-{1,2}[A-Za-z0-9_-]{8}(?=\.[a-z0-9]+$)/i;
function familyOf(key, value, file) {
  // JS 业务 chunk 直接取 manifest name（无 hash）；css/字体等资产按文件名剥哈希
  if (kindOf(file) === 'js' && value && typeof value.name === 'string' && value.name) {
    return value.name;
  }
  return path
    .basename(file)
    .replace(HASH_RE, '')
    .replace(/\.[a-z0-9]+$/i, '');
}

/**
 * 沿 imports 递归计算静态闭包（循环去重；缺 key 硬失败）。
 * 返回按访问序排列的请求列表：[{ source, role, family, kind, file, rawKb, gzipKb }]
 */
function resolveManifestKey(entryPath) {
  if (manifest[entryPath]) return entryPath;
  const needle = entryPath.replace(/\\/g, '/');
  const bySrc = Object.entries(manifest).find(([, v]) => v && v.src === needle);
  if (bySrc) return bySrc[0];
  const base = path.basename(needle, path.extname(needle));
  const byName = Object.entries(manifest).find(([, v]) => v && v.isDynamicEntry && v.name === base);
  if (byName) return byName[0];
  return entryPath;
}

function closure(startKey) {
  const seen = new Set();
  const byFile = new Map();
  const queue = [resolveManifestKey(startKey)];
  while (queue.length) {
    const key = queue.shift();
    if (seen.has(key)) continue;
    seen.add(key);
    const v = manifest[key];
    if (!v || typeof v.file !== 'string') {
      throw new Error(`[budget] manifest 闭包引用缺失：${key}（禁止文件名猜测）`);
    }
    const role =
      key === startKey || resolveManifestKey(startKey) === key
        ? v.isEntry
          ? 'entry'
          : 'dynamic-entry'
        : 'shared';
    const add = (file, roleFor) => {
      if (byFile.has(file)) return;
      byFile.set(file, {
        source: key,
        role: roleFor,
        family: familyOf(key, v, file),
        kind: kindOf(file),
        file,
        rawKb: rawKb(file),
        gzipKb: gzipKb(file),
      });
    };
    add(v.file, role);
    for (const css of v.css || []) add(css, 'css');
    for (const asset of v.assets || []) add(asset, 'asset');
    for (const imp of v.imports || []) queue.push(imp);
  }
  return [...byFile.values()];
}

/** 入口硬校验：manifest 必须包含预期 entry 且是真实 dynamic/静态 entry */
function requireEntry(key, expectDynamic) {
  const resolved = resolveManifestKey(key);
  const v = manifest[resolved];
  if (!v) {
    throw new Error(`[budget] manifest 缺少预期入口 ${key}（不返回 0KB 假绿）`);
  }
  if (expectDynamic && !v.isDynamicEntry) {
    throw new Error(`[budget] manifest 入口 ${key}（→ ${resolved}）不是 dynamic entry`);
  }
  return v;
}

/** 当前 manifest 引用的 JS 资产按 family 聚合（chunk 级字节预算；忽略 stale hash） */
function chunkAggregates() {
  const byFamily = new Map();
  const assetsDir = path.join(distDir, 'assets');
  if (!fs.existsSync(assetsDir)) {
    return byFamily;
  }
  for (const name of fs.readdirSync(assetsDir)) {
    if (!name.endsWith('.js')) continue;
    const file = `assets/${name}`;
    if (!activeFiles.has(file)) continue;
    const family = familyOf(null, null, file);
    const agg = byFamily.get(family) || { rawKb: 0, gzipKb: 0, files: 0 };
    agg.rawKb += rawKb(file);
    agg.gzipKb += gzipKb(file);
    agg.files += 1;
    byFamily.set(family, agg);
  }
  return byFamily;
}

/** vendor 单文件校验：jsxgraph/katex/three 全仓只能有一个 chunk 文件 */
function checkVendorSingleFile(chunks) {
  const violations = [];
  for (const vendor of budget.vendors || []) {
    const agg = chunks[vendor];
    if (!agg) {
      violations.push(`vendor ${vendor} 未生成独立 chunk（应随 manualChunks 拆出）`);
    } else if (agg.files > 1) {
      violations.push(
        `vendor ${vendor} 重复进入 ${agg.files} 个 chunk 文件（禁止同一依赖重复进多个业务 chunk）`,
      );
    }
  }
  return violations;
}

/** 规范化请求集合（family:kind），baseline 比较用 */
function familySet(requests) {
  return new Set(requests.map((r) => `${r.family}:${r.kind}`));
}

/** 当前报告 vs 拆分前 baseline：只允许声明的 splitTransforms */
function compareBaseline(current, baselineReport) {
  const violations = [];
  if (!baselineReport?.routes) {
    violations.push(`baseline ${baselinePath} 缺失或结构无效`);
    return violations;
  }
  const transforms = budget.splitTransforms || {};
  for (const routeName of Object.keys(budget.entries || {})) {
    const currReq = current.routes[routeName].requests;
    const baseReq = baselineReport.routes[routeName]?.requests;
    if (!baseReq) {
      violations.push(`baseline 缺少路径 ${routeName}`);
      continue;
    }
    const curr = familySet(currReq);
    const base = familySet(baseReq);
    const routeTransforms = transforms[routeName] || {};
    // 声明需拆分的 family 仍整包存在 → 违规
    for (const src of Object.keys(routeTransforms)) {
      if (base.has(`${src}:js`) && curr.has(`${src}:js`)) {
        violations.push(`${routeName}: ${src} 未按 splitTransforms 拆分`);
      }
    }
    // 基线有、当前缺：只允许命中 splitTransforms（且该路径仍保有至少一个拆分目标）
    for (const f of base) {
      if (curr.has(f)) continue;
      const [fam, kind] = f.split(':');
      const targets = routeTransforms[fam] || [];
      if (kind !== 'js' || !targets.length) {
        violations.push(
          `${routeName}: 基线请求集合成员 ${f} 在当前构建中消失（无对应 splitTransforms）`,
        );
        continue;
      }
      const present = targets.filter((t) => curr.has(`${t}:js`));
      if (!present.length) {
        violations.push(
          `${routeName}: 拆分后（源自 ${f}）该路径未保有任一目标 chunk（${targets.join('/')}）`,
        );
      }
    }
    // 当前有、基线没有：只允许命中 splitTransforms 的目标（其源 family 已在基线）
    const allowedAdded = new Set();
    for (const [src, targets] of Object.entries(routeTransforms)) {
      if (base.has(`${src}:js`)) {
        for (const t of targets) allowedAdded.add(`${t}:js`);
      }
    }
    for (const f of curr) {
      if (base.has(f)) continue;
      if (!allowedAdded.has(f)) {
        violations.push(`${routeName}: 当前请求集合新增未声明成员 ${f}`);
      }
    }
  }
  return violations;
}

/** 应用 budget.json 阈值 */
function applyThresholds(report) {
  const violations = [];
  // chunk / index 聚合 / total
  const aggregates = report.chunks;
  for (const rule of budget.chunks || []) {
    const agg = aggregates[rule.name];
    const raw = agg?.rawKb ?? 0;
    const gzip = agg?.gzipKb ?? 0;
    const ruleV = [];
    if (rule.rawMaxKb != null && raw > rule.rawMaxKb) {
      ruleV.push(`${rule.name} raw: ${raw.toFixed(0)}kB > 预算 ${rule.rawMaxKb}kB（${rule.note}）`);
    }
    if (rule.gzipMaxKb != null && gzip > rule.gzipMaxKb) {
      ruleV.push(
        `${rule.name} gzip: ${gzip.toFixed(0)}kB > 预算 ${rule.gzipMaxKb}kB（${rule.note}）`,
      );
    }
    if (ruleV.length) {
      violations.push(...ruleV);
      console.error(
        `[budget] ${rule.name}: raw ${raw.toFixed(0)}kB / gzip ${gzip.toFixed(0)}kB [FAIL]`,
      );
    } else {
      console.log(
        `[budget] ${rule.name}: raw ${raw.toFixed(0)}kB / gzip ${gzip.toFixed(0)}kB <= ${rule.rawMaxKb}kB / ${rule.gzipMaxKb}kB`,
      );
    }
  }
  const totalV = [];
  if (budget.totalRawMaxKb != null && report.total.rawKb > budget.totalRawMaxKb) {
    totalV.push(`total raw: ${report.total.rawKb.toFixed(0)}kB > 预算 ${budget.totalRawMaxKb}kB`);
  }
  if (budget.totalGzipMaxKb != null && report.total.gzipKb > budget.totalGzipMaxKb) {
    totalV.push(
      `total gzip: ${report.total.gzipKb.toFixed(0)}kB > 预算 ${budget.totalGzipMaxKb}kB`,
    );
  }
  violations.push(...totalV);
  console.log(
    `[budget] total: raw ${report.total.rawKb.toFixed(0)}kB / gzip ${report.total.gzipKb.toFixed(0)}kB ${totalV.length ? '[FAIL]' : '[ok]'}`,
  );
  // 路径级
  for (const [routeName, routeCfg] of Object.entries(budget.routes || {})) {
    const r = report.routes[routeName];
    if (!r) {
      violations.push(`报告缺少路径 ${routeName}`);
      continue;
    }
    const absolute = routeName === 'initial';
    const raw = absolute ? r.rawKb : r.incrementalRawKb;
    const gzip = absolute ? r.gzipKb : r.incrementalGzipKb;
    const count = absolute ? r.assetCount : r.incrementalAssetCount;
    const rawMax = routeCfg.rawMaxKb ?? routeCfg.incrementalRawMaxKb;
    const gzipMax = routeCfg.gzipMaxKb ?? routeCfg.incrementalGzipMaxKb;
    const routeV = [];
    if (rawMax != null && raw > rawMax) {
      routeV.push(
        `${routeName} raw: ${raw.toFixed(0)}kB > 预算 ${rawMax}kB（${routeCfg.note || ''}）`,
      );
    }
    if (gzipMax != null && gzip > gzipMax) {
      routeV.push(
        `${routeName} gzip: ${gzip.toFixed(0)}kB > 预算 ${gzipMax}kB（${routeCfg.note || ''}）`,
      );
    }
    if (routeCfg.maxAssetCount != null && count > routeCfg.maxAssetCount) {
      routeV.push(
        `${routeName} 请求数: ${count} > 预算 ${routeCfg.maxAssetCount}（${routeCfg.note || ''}）`,
      );
    }
    for (const forbidden of routeCfg.forbiddenChunks || []) {
      const hit = r.requests.filter((x) => x.family === forbidden);
      if (hit.length) {
        routeV.push(
          `${routeName} 含禁用 chunk ${forbidden}（${hit.map((x) => x.file).join(', ')}）`,
        );
      }
    }
    violations.push(...routeV);
    console.log(
      `[budget] ${routeName}: raw ${raw.toFixed(0)}kB / gzip ${gzip.toFixed(0)}kB / ${count} requests ${routeV.length ? '[FAIL]' : '[ok]'}`,
    );
  }
  return violations;
}

/** 组装完整报告 */
function buildReport() {
  const entries = budget.entries || {};
  const initial = closure(entries.initial);
  const graph = closure(entries.mathGraph);
  const classroom = closure(entries.mathClassroomKatexOnly);
  const accountCloud = entries.accountCloud ? closure(entries.accountCloud) : [];
  const initialFiles = new Set(initial.map((r) => r.file));
  const incremental = (requests) => requests.filter((r) => !initialFiles.has(r.file));

  const sum = (requests) => ({
    rawKb: requests.reduce((a, r) => a + r.rawKb, 0),
    gzipKb: requests.reduce((a, r) => a + r.gzipKb, 0),
  });

  const aggregates = chunkAggregates();
  const chunks = {};
  for (const [family, agg] of aggregates) {
    chunks[family] = { rawKb: agg.rawKb, gzipKb: agg.gzipKb, files: agg.files };
  }

  // total = 当前 manifest 引用的 JS + CSS（忽略 stale hash；字体等不计）
  let totalJsCssRaw = 0;
  let totalJsCssGzip = 0;
  for (const file of activeFiles) {
    if (!/\.(js|css)$/.test(file)) continue;
    if (!fs.existsSync(diskPath(file))) {
      throw new Error(`[budget] manifest 引用缺失文件：${file}`);
    }
    totalJsCssRaw += rawKb(file);
    totalJsCssGzip += gzipKb(file);
  }

  const gIncr = incremental(graph);
  const cIncr = incremental(classroom);
  const aIncr = incremental(accountCloud);
  const iSum = sum(initial);
  const gSum = sum(gIncr);
  const cSum = sum(cIncr);
  const aSum = sum(aIncr);

  return {
    formatVersion: 1,
    entries,
    routes: {
      initial: {
        requests: initial,
        rawKb: iSum.rawKb,
        gzipKb: iSum.gzipKb,
        assetCount: initial.length,
      },
      mathGraph: {
        requests: gIncr,
        incrementalRawKb: gSum.rawKb,
        incrementalGzipKb: gSum.gzipKb,
        incrementalAssetCount: gIncr.length,
      },
      mathClassroomKatexOnly: {
        requests: cIncr,
        incrementalRawKb: cSum.rawKb,
        incrementalGzipKb: cSum.gzipKb,
        incrementalAssetCount: cIncr.length,
      },
      ...(entries.accountCloud
        ? {
            accountCloud: {
              requests: aIncr,
              incrementalRawKb: aSum.rawKb,
              incrementalGzipKb: aSum.gzipKb,
              incrementalAssetCount: aIncr.length,
            },
          }
        : {}),
    },
    chunks,
    total: { rawKb: totalJsCssRaw, gzipKb: totalJsCssGzip },
  };
}

function main() {
  // 入口硬校验（缺 entry 直接失败，不猜测文件名）
  requireEntry(budget.entries.initial, false);
  requireEntry(budget.entries.mathGraph, true);
  requireEntry(budget.entries.mathClassroomKatexOnly, true);
  if (budget.entries.accountCloud) {
    requireEntry(budget.entries.accountCloud, true);
  }

  const report = buildReport();

  if (reportOnly) {
    fs.writeFileSync(reportTarget, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[budget] report 写入 ${reportTarget}`);
    return;
  }

  const violations = [];
  violations.push(...checkVendorSingleFile(report.chunks));
  let baseline = null;
  if (fs.existsSync(baselinePath)) {
    try {
      baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    } catch {
      violations.push(`baseline ${baselinePath} 无法解析`);
    }
  } else {
    violations.push(`baseline ${baselinePath} 缺失（版本化拆分前 fixture 应已提交）`);
  }
  if (baseline) violations.push(...compareBaseline(report, baseline));
  violations.push(...applyThresholds(report));

  if (violations.length) {
    console.error('[budget] 性能预算超限：');
    for (const v of violations) console.error('  ' + v);
    process.exit(1);
  }
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
