/**
 * Electron stage 布局纯函数（P1）。
 *
 * 与目录构造/复制清单/manifest 生成解耦，支持注入 repoRoot/stageRoot/
 * serverSourceRoot，供单元测试用系统临时目录自包含验证；
 * stage-electron-server.js 调用本模块执行真实 stage。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** 复制清单（相对 server src 的目录/文件 + 根级复制目标） */
export const COPY_DIRS = ['db', 'routes', 'seed', 'utils', 'services', 'public'];
export const COPY_FILES = ['index.js', 'paths.js'];
/** 根级复制：dist/domain → <stageRoot>/dist/domain（routes 的 ../../dist 同构） */
export const COPY_ROOT_DIRS = ['dist/domain'];

/**
 * @param {{ stageRoot: string, serverSourceRoot: string, serverRoot: string }} options
 * @returns {{ stageServer: string, copyFiles: Array<{from: string, to: string}>, copyDirs: Array<{from: string, to: string}>, copyRootDirs: Array<{from: string, to: string}>, missing: string[] }}
 */
export function resolveStageLayout({ stageRoot, serverSourceRoot, serverRoot }) {
  const stageServer = path.join(stageRoot, 'server');
  const copyFiles = COPY_FILES.map((f) => ({
    from: path.join(serverSourceRoot, f),
    to: path.join(stageServer, f),
  }));
  const copyDirs = [];
  const missing = [];
  for (const d of COPY_DIRS) {
    const from = path.join(serverSourceRoot, d);
    if (fs.existsSync(from)) {
      copyDirs.push({ from, to: path.join(stageServer, d) });
    } else {
      const fromServer = path.join(serverRoot, d);
      if (fs.existsSync(fromServer)) {
        copyDirs.push({ from: fromServer, to: path.join(stageServer, d) });
      } else {
        missing.push(d);
      }
    }
  }
  const copyRootDirs = COPY_ROOT_DIRS.map((d) => ({
    from: path.join(serverRoot, d),
    to: path.join(stageRoot, d),
  }));
  return { stageServer, copyFiles, copyDirs, copyRootDirs, missing };
}

/**
 * 生成 stage manifest（相对 stageRoot 路径 + sha256 + 版本）。
 * @param {{ stageRoot: string, appVersion: string, now?: () => string }} options
 * @returns {{ manifestPath: string, manifest: object }}
 */
export function buildStageManifest({
  stageRoot,
  appVersion,
  now = () => new Date().toISOString(),
}) {
  const files = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else {
        const hash = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
        files.push({ path: full.replace(stageRoot + '/', ''), hash, size: st.size });
      }
    }
  };
  walk(stageRoot);
  const manifest = {
    appVersion,
    builtAt: now(),
    fileCount: files.length,
    files,
  };
  const manifestPath = path.join(stageRoot, 'stage-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return { manifestPath, manifest };
}

/**
 * electron-builder extraResources 映射（与最终 Resources 布局一一对应）。
 * @returns {Array<{from: string, to: string}>}
 */
export function resolvePackagedResourceMappings() {
  return [
    { from: '.electron-stage/server', to: 'server' },
    { from: '.electron-stage/dist', to: 'dist' },
  ];
}
