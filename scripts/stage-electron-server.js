/**
 * 为 Electron 打包准备精简版 server 目录（.electron-stage/server）。
 *
 * 目录构造/复制清单/manifest 生成逻辑在 electron-stage-layout.mjs
 * （可注入测试）；本脚本只做编排：预构建 Server TS → 执行复制 → 生成 manifest。
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
} from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  resolveStageLayout,
  buildStageManifest,
  COPY_ROOT_DIRS,
} from './electron-stage-layout.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stageRoot = join(root, '.electron-stage');
const srcServer = join(root, 'apps', 'server');
const srcCode = join(srcServer, 'src');

// R1：Electron staging 主动构建 Server TS 产物（不依赖本机残留 dist）
const serverDistPolicy = join(srcServer, 'dist', 'domain', 'settings-policy.js');
if (!existsSync(serverDistPolicy)) {
  console.log('[stage] Server TS 产物缺失，先构建 @xiaohuang/server …');
  execSync('npm run build -w @xiaohuang/server', { cwd: root, stdio: 'inherit' });
}

const layout = resolveStageLayout({
  repoRoot: root,
  stageRoot,
  serverSourceRoot: srcCode,
  serverRoot: srcServer,
});

console.log('Staging Electron server →', layout.stageServer);
rmSync(stageRoot, { recursive: true, force: true });
mkdirSync(layout.stageServer, { recursive: true });

for (const { from, to } of layout.copyFiles) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}
for (const { from, to } of layout.copyDirs) {
  cpSync(from, to, { recursive: true });
}
for (const d of layout.missing) {
  console.warn('skip missing', d);
}
// 根级复制（dist/domain）：目标 .electron-stage/dist/domain
for (const { from, to } of layout.copyRootDirs) {
  if (existsSync(from)) {
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
    console.log(`[stage] 根级复制: ${from.replace(root + '/', '')} → ${to.replace(stageRoot + '/', '')}`);
  } else {
    console.warn('skip missing root copy', COPY_ROOT_DIRS.join(','));
  }
}

// public 在 apps/server 根目录
const publicSrc = join(srcServer, 'public');
if (existsSync(publicSrc)) {
  cpSync(publicSrc, join(layout.stageServer, 'public'), { recursive: true });
}

const pkg = JSON.parse(readFileSync(join(srcServer, 'package.json'), 'utf8'));
// 本地 workspace 包（registry 不存在）从仓库复制，不参与 npm install
const LOCAL_PACKAGES = ['domain-core', 'subject-settings', 'math-expr'];
const slimDeps = { ...(pkg.dependencies || {}) };
for (const name of LOCAL_PACKAGES) delete slimDeps[`@xiaohuang/${name}`];
writeFileSync(
  join(layout.stageServer, 'package.json'),
  JSON.stringify({ name: pkg.name, version: pkg.version, private: true, main: 'index.js', dependencies: slimDeps }, null, 2),
);

console.log('npm install --omit=dev in stage…');
execSync('npm install --omit=dev --no-audit --no-fund', {
  cwd: layout.stageServer,
  stdio: 'inherit',
});

// 复制本地 workspace 包（含 dist 双产物）到 stage node_modules
for (const name of LOCAL_PACKAGES) {
  const src = join(root, 'packages', name);
  const dst = join(layout.stageServer, 'node_modules', '@xiaohuang', name);
  mkdirSync(join(dst, '..'), { recursive: true });
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true });
  console.log(`[stage] 本地包复制: @xiaohuang/${name}`);
}

const sqlDist = join(layout.stageServer, 'node_modules', 'sql.js', 'dist');
if (existsSync(sqlDist)) {
  for (const name of readdirSync(sqlDist)) {
    if (name === 'sql-asm.js') continue;
    rmSync(join(sqlDist, name), { recursive: true, force: true });
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
      if (name === 'node_modules') {
        for (const big of ['typescript', 'esbuild', 'tsup', 'vite', 'vitest', '@vitest']) {
          rmSync(join(p, big), { recursive: true, force: true });
        }
      }
      pruneJunk(p, depth + 1);
    } else if (name.endsWith('.map') || name.endsWith('.ts')) {
      rmSync(p, { force: true });
    }
  }
}
pruneJunk(layout.stageServer);

// 生成 manifest（纯函数）
const { manifestPath } = buildStageManifest({
  stageRoot,
  appVersion: process.env.APP_VERSION || pkg.version || '0.0.1',
});
// 发布前 smoke：从 stage 布局加载 server 入口（等价 Electron 启动时 require）。
// 路径经 argv 传入，避免 shell 引号冲突。
const stageIndex = join(layout.stageServer, 'index.js');
const smokeScript = [
  "process.env.CHEM_LAB_ELECTRON='1';",
  "process.env.CHEM_LAB_DATA_DIR=require('os').tmpdir()+require('path').sep+'chem-lab-stage-smoke';",
  "process.env.OPEN_BROWSER='0';",
  "require(process.argv[1]);",
  "console.log('stage require ok');",
].join('');
try {
  execSync(`node -e ${JSON.stringify(smokeScript)} ${JSON.stringify(stageIndex)}`, {
    cwd: root,
    stdio: 'inherit',
  });
} catch {
  console.error('Stage smoke require FAILED — Electron 包会启动即退出');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
console.log(`[stage-manifest] ${manifest.fileCount} 个文件，version=${manifest.appVersion}`);
