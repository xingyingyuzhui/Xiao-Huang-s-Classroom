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
 * 将 stage 内绝对路径转为 manifest 用 POSIX 相对路径。
 * 禁止绝对路径、盘符、反斜杠与 `..` 穿越。
 *
 * @param {string} stageRoot
 * @param {string} full
 * @param {import('node:path').PlatformPath} [pathApi=path]
 * @returns {string}
 */
export function toManifestPath(stageRoot, full, pathApi = path) {
  const relative = pathApi.relative(stageRoot, full);
  if (!relative || relative === '.') {
    throw new Error(`manifest 路径无效: stageRoot=${stageRoot} full=${full}`);
  }
  // 统一为 POSIX，并拒绝穿越
  const posix = relative.split(pathApi.sep).join('/');
  if (
    posix.startsWith('..') ||
    pathApi.isAbsolute(relative) ||
    /^[A-Za-z]:/.test(posix) ||
    posix.includes('\\')
  ) {
    throw new Error(`manifest 路径拒绝绝对/穿越/反斜杠路径: ${posix}`);
  }
  return posix;
}

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
 * 生成 stage manifest（相对 stageRoot 的 POSIX 路径 + sha256 + 版本）。
 * @param {{ stageRoot: string, appVersion: string, now?: () => string, pathApi?: import('node:path').PlatformPath }} options
 * @returns {{ manifestPath: string, manifest: object }}
 */
export function buildStageManifest({
  stageRoot,
  appVersion,
  now = () => new Date().toISOString(),
  pathApi = path,
}) {
  const files = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = pathApi.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else {
        const hash = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
        files.push({
          path: toManifestPath(stageRoot, full, pathApi),
          hash,
          size: st.size,
        });
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
  const manifestPath = pathApi.join(stageRoot, 'stage-manifest.json');
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

/** 最终 Electron 资源目录必须具备的关键文件 */
export const ELECTRON_RESOURCE_KEY_FILES = [
  'server/index.js',
  'server/routes/settings.js',
  'dist/domain/settings-policy.js',
];

/**
 * 在 dist-electron（或任意根）下发现具备 Electron 最终资源结构的目录。
 * 兼容 macOS `Resources` 与 Windows `resources`，不只做大小写宽松匹配。
 *
 * @param {string} distRoot
 * @param {{ fsApi?: typeof fs, pathApi?: import('node:path').PlatformPath, keyFiles?: string[] }} [opts]
 * @returns {string | null}
 */
export function findElectronResources(distRoot, opts = {}) {
  const fsApi = opts.fsApi || fs;
  const pathApi = opts.pathApi || path;
  const keyFiles = opts.keyFiles || ELECTRON_RESOURCE_KEY_FILES;
  if (!fsApi.existsSync(distRoot)) return null;

  /** @type {string[]} */
  const candidates = [];
  const walk = (dir, depth = 0) => {
    if (depth > 6) return;
    let entries;
    try {
      entries = fsApi.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = pathApi.join(dir, e.name);
      if (e.name === 'Resources' || e.name === 'resources') {
        candidates.push(full);
      }
      walk(full, depth + 1);
    }
  };
  walk(distRoot);

  for (const candidate of candidates) {
    const ok = keyFiles.every((rel) => fsApi.existsSync(pathApi.join(candidate, rel)));
    if (ok) return candidate;
  }
  return null;
}

/**
 * 按 package.json#files 白名单复制本地 workspace 运行时包。
 * 只允许 package.json + files 声明的内容进入 stage，禁止整目录复制。
 *
 * @param {{
 *   sourceRoot: string,
 *   targetRoot: string,
 *   fsApi?: typeof fs,
 *   pathApi?: import('node:path').PlatformPath,
 * }} options
 * @returns {{ copied: string[], packageName: string }}
 */
export function copyRuntimePackage({ sourceRoot, targetRoot, fsApi = fs, pathApi = path }) {
  const pkgPath = pathApi.join(sourceRoot, 'package.json');
  if (!fsApi.existsSync(pkgPath)) {
    throw new Error(`copyRuntimePackage: 缺少 package.json: ${sourceRoot}`);
  }
  const pkg = JSON.parse(fsApi.readFileSync(pkgPath, 'utf8'));
  const filesField = Array.isArray(pkg.files) ? pkg.files : [];
  if (filesField.length === 0) {
    throw new Error(
      `copyRuntimePackage: ${pkg.name || sourceRoot} 的 package.json#files 为空，拒绝整包复制`,
    );
  }

  // 清理目标，避免残留开发文件
  fsApi.rmSync(targetRoot, { recursive: true, force: true });
  fsApi.mkdirSync(targetRoot, { recursive: true });

  const copied = ['package.json'];
  fsApi.copyFileSync(pkgPath, pathApi.join(targetRoot, 'package.json'));

  for (const entry of filesField) {
    const from = pathApi.join(sourceRoot, entry);
    const to = pathApi.join(targetRoot, entry);
    if (!fsApi.existsSync(from)) {
      throw new Error(`copyRuntimePackage: files 条目不存在: ${entry} (${pkg.name})`);
    }
    fsApi.mkdirSync(pathApi.dirname(to), { recursive: true });
    fsApi.cpSync(from, to, { recursive: true });
    copied.push(entry);
  }

  // 校验 main/module/exports 引用的入口在目标中存在
  const entryRefs = collectPackageEntryRefs(pkg);
  for (const ref of entryRefs) {
    const abs = pathApi.join(targetRoot, ref);
    if (!fsApi.existsSync(abs)) {
      throw new Error(
        `copyRuntimePackage: ${pkg.name} 入口 ${ref} 在 stage 目标中不存在（检查 files 白名单）`,
      );
    }
  }

  // 白名单复制后剔除 source map（tsup 可能在 dist 内产出）
  stripSourceMaps(targetRoot, fsApi, pathApi);

  // 禁止开发/构建残留进入 stage
  assertNoDevArtifacts(targetRoot, fsApi, pathApi);

  return { copied, packageName: pkg.name || pathApi.basename(sourceRoot) };
}

/**
 * @param {object} pkg
 * @returns {string[]}
 */
function collectPackageEntryRefs(pkg) {
  /** @type {string[]} */
  const refs = [];
  const push = (v) => {
    if (typeof v === 'string') {
      if (v.startsWith('http:') || v.startsWith('https:')) return;
      const cleaned = v.replace(/^\.\//, '');
      if (cleaned && !cleaned.includes('*') && !cleaned.startsWith('#')) refs.push(cleaned);
    } else if (v && typeof v === 'object') {
      for (const child of Object.values(v)) push(child);
    }
  };
  push(pkg.main);
  push(pkg.module);
  push(pkg.types);
  push(pkg.exports);
  return [...new Set(refs)];
}

/**
 * @param {string} rootDir
 * @param {typeof fs} fsApi
 * @param {import('node:path').PlatformPath} pathApi
 */
function stripSourceMaps(rootDir, fsApi, pathApi) {
  const walk = (dir) => {
    for (const name of fsApi.readdirSync(dir)) {
      const full = pathApi.join(dir, name);
      const st = fsApi.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith('.map')) fsApi.rmSync(full, { force: true });
    }
  };
  walk(rootDir);
}

/**
 * @param {string} rootDir
 * @param {typeof fs} fsApi
 * @param {import('node:path').PlatformPath} pathApi
 */
function assertNoDevArtifacts(rootDir, fsApi, pathApi) {
  const forbiddenNames = new Set(['coverage', '.turbo', 'test', 'src', 'node_modules']);
  const forbiddenPrefixes = ['tsconfig', 'vitest.config', 'tsup.config'];
  const walk = (dir) => {
    for (const name of fsApi.readdirSync(dir)) {
      const full = pathApi.join(dir, name);
      const st = fsApi.statSync(full);
      if (st.isDirectory()) {
        if (forbiddenNames.has(name)) {
          throw new Error(`copyRuntimePackage: 禁止目录进入 stage: ${name}`);
        }
        walk(full);
      } else {
        if (forbiddenPrefixes.some((p) => name.startsWith(p))) {
          throw new Error(`copyRuntimePackage: 禁止配置进入 stage: ${name}`);
        }
        if (name.endsWith('.ts') && !name.endsWith('.d.ts')) {
          throw new Error(`copyRuntimePackage: 禁止 TypeScript 源进入 stage: ${name}`);
        }
        if (name.endsWith('.map')) {
          throw new Error(`copyRuntimePackage: 禁止 source map 进入 stage: ${name}`);
        }
      }
    }
  };
  walk(rootDir);
}
