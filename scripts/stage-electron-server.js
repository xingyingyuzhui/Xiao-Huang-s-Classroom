/**
 * 为 Electron 打包准备精简版 server 目录（.electron-stage/server）
 */
import {
  cpSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stageRoot = join(root, '.electron-stage');
const stageServer = join(stageRoot, 'server');
const srcServer = join(root, 'apps', 'server');
const srcCode = join(srcServer, 'src');

const COPY_DIRS = ['db', 'routes', 'seed', 'utils', 'services', 'public'];
/** 特殊复制：dist/domain 放 stage 根（routes 的 ../../dist 解析到 .electron-stage/dist） */
const COPY_ROOT_DIRS = ['dist/domain'];

// R1：Electron staging 主动构建 Server TS 产物（不依赖本机残留 dist）
const serverDistPolicy = join(srcServer, 'dist', 'domain', 'settings-policy.js');
if (!existsSync(serverDistPolicy)) {
  console.log('[stage] Server TS 产物缺失，先构建 @xiaohuang/server …');
  execSync('npm run build -w @xiaohuang/server', { cwd: root, stdio: 'inherit' });
}
const COPY_FILES = ['index.js', 'paths.js'];

function rimraf(p) {
  rmSync(p, { recursive: true, force: true });
}

function copyFile(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}

console.log('Staging Electron server →', stageServer);
rimraf(stageRoot);
mkdirSync(stageServer, { recursive: true });

for (const f of COPY_FILES) {
  copyFile(join(srcCode, f), join(stageServer, f));
}
for (const d of COPY_DIRS) {
  const from = join(srcCode, d);
  if (!existsSync(from)) {
    const fromPublic = join(srcServer, d);
    if (existsSync(fromPublic)) {
      cpSync(fromPublic, join(stageServer, d), { recursive: true });
      continue;
    }
    console.warn('skip missing', d);
    continue;
  }
  cpSync(from, join(stageServer, d), { recursive: true });
}
// 根级复制（dist/domain）：目标 .electron-stage/dist/domain
for (const d of COPY_ROOT_DIRS) {
  const from = join(srcServer, d);
  if (existsSync(from)) {
    mkdirSync(join(stageRoot, dirname(d)), { recursive: true });
    cpSync(from, join(stageRoot, d), { recursive: true });
    console.log(`[stage] 根级复制: ${d} → .electron-stage/${d}`);
  } else {
    console.warn('skip missing root copy', d);
  }
}

// public 在 apps/server 根目录
const publicSrc = join(srcServer, 'public');
if (existsSync(publicSrc)) {
  cpSync(publicSrc, join(stageServer, 'public'), { recursive: true });
}

const pkg = JSON.parse(readFileSync(join(srcServer, 'package.json'), 'utf8'));
// 本地 workspace 包（registry 不存在）从仓库复制，不参与 npm install
const LOCAL_PACKAGES = ['domain-core', 'subject-settings', 'math-expr'];
const slimDeps = { ...(pkg.dependencies || {}) };
for (const name of LOCAL_PACKAGES) delete slimDeps[`@xiaohuang/${name}`];
const slim = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  main: 'index.js',
  dependencies: slimDeps,
};
writeFileSync(join(stageServer, 'package.json'), JSON.stringify(slim, null, 2));

console.log('npm install --omit=dev in stage…');
execSync('npm install --omit=dev --no-audit --no-fund', {
  cwd: stageServer,
  stdio: 'inherit',
});

// 复制本地 workspace 包（含 dist 双产物）到 stage node_modules
for (const name of LOCAL_PACKAGES) {
  const src = join(root, 'packages', name);
  const dst = join(stageServer, 'node_modules', '@xiaohuang', name);
  mkdirSync(dirname(dst), { recursive: true });
  rimraf(dst);
  cpSync(src, dst, { recursive: true });
  console.log(`[stage] 本地包复制: @xiaohuang/${name}`);
}

const sqlDist = join(stageServer, 'node_modules', 'sql.js', 'dist');
if (existsSync(sqlDist)) {
  for (const name of readdirSync(sqlDist)) {
    if (name === 'sql-asm.js') continue;
    rimraf(join(sqlDist, name));
  }
  console.log('sql.js dist kept: sql-asm.js only');
}

function pruneJunk(dir, depth = 0) {
  if (depth > 8 || !existsSync(dir)) return;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (
        /^(test|tests|__tests__|docs|doc|example|examples|benchmark|benchmarks|man|\.bin)$/i.test(
          name,
        )
      ) {
        rimraf(p);
        continue;
      }
      pruneJunk(p, depth + 1);
    } else if (
      /\.(md|ts|map|markdown)$/i.test(name) ||
      /^(README|CHANGELOG|LICENSE|LICENCE)/i.test(name)
    ) {
      try {
        rmSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}
pruneJunk(join(stageServer, 'node_modules'));

function du(p) {
  try {
    return execSync(`du -sh "${p}" | cut -f1`, { encoding: 'utf8' }).trim();
  } catch {
    return '?';
  }
}

try {
  const entry = join(stageServer, 'index.js');
  const smoke = [
    `process.env.CHEM_LAB_ELECTRON='1';`,
    `process.env.CHEM_LAB_DATA_DIR=require('os').tmpdir()+require('path').sep+'chem-lab-stage-smoke';`,
    `process.env.OPEN_BROWSER='0';`,
    `require(${JSON.stringify(entry)});`,
    `console.log('stage require ok');`,
  ].join('');
  execSync(`node -e ${JSON.stringify(smoke)}`, { stdio: 'inherit', cwd: root });
} catch (e) {
  console.error('Stage smoke require FAILED — Electron 包会启动即退出');
  throw e;
}

console.log('Stage server size:', du(stageServer));
console.log('Done.');

// ───────────────────────── Stage manifest（Program 6 Task 6.3） ─────────────────────────

import { createHash } from 'crypto';
import { APP_VERSION } from '@xiaohuang/config';

function sha256(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

/** 递归收集 stage 目录文件并计算 hash，生成 manifest（打包前完整性校验依据）。 */
function writeStageManifest() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else files.push({ path: full, hash: sha256(full), size: st.size });
    }
  };
  walk(stageRoot);
  const manifest = {
    appVersion: APP_VERSION,
    builtAt: new Date().toISOString(),
    fileCount: files.length,
    files: files.map((f) => ({
      path: f.path.replace(stageRoot + '/', ''),
      hash: f.hash,
      size: f.size,
    })),
  };
  writeFileSync(join(stageRoot, 'stage-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[stage-manifest] ${manifest.fileCount} 个文件，version=${APP_VERSION}`);
}

writeStageManifest();
