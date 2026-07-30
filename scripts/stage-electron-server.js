/**
 * 为 Electron 打包准备精简版 server 目录（.electron-stage/server）
 */
import { cpSync, mkdirSync, rmSync, readdirSync, statSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stageRoot = join(root, '.electron-stage');
const stageServer = join(stageRoot, 'server');
const srcServer = join(root, 'apps', 'server');
const srcCode = join(srcServer, 'src');

const COPY_DIRS = ['db', 'routes', 'seed', 'utils', 'services', 'public'];
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

// public 在 apps/server 根目录
const publicSrc = join(srcServer, 'public');
if (existsSync(publicSrc)) {
  cpSync(publicSrc, join(stageServer, 'public'), { recursive: true });
}

const pkg = JSON.parse(readFileSync(join(srcServer, 'package.json'), 'utf8'));
const slim = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  main: 'index.js',
  dependencies: pkg.dependencies || {},
};
writeFileSync(join(stageServer, 'package.json'), JSON.stringify(slim, null, 2));

console.log('npm install --omit=dev in stage…');
execSync('npm install --omit=dev --no-audit --no-fund', {
  cwd: stageServer,
  stdio: 'inherit',
});

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
    } else if (/\.(md|ts|map|markdown)$/i.test(name) || /^(README|CHANGELOG|LICENSE|LICENCE)/i.test(name)) {
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
