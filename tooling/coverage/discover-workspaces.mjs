/**
 * 动态发现声明 coverage script 的 workspace（可注入 packagesRoot）。
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {{ packagesRoot: string, fsApi?: typeof fs, pathApi?: import('node:path').PlatformPath }} options
 * @returns {Array<{ name: string, dir: string, packageJsonPath: string, packageJson: object }>}
 */
export function discoverCoverageWorkspaces({ packagesRoot, fsApi = fs, pathApi = path }) {
  if (!fsApi.existsSync(packagesRoot)) return [];
  /** @type {Array<{ name: string, dir: string, packageJsonPath: string, packageJson: object }>} */
  const out = [];
  for (const name of fsApi.readdirSync(packagesRoot)) {
    const dir = pathApi.join(packagesRoot, name);
    const packageJsonPath = pathApi.join(dir, 'package.json');
    if (!fsApi.existsSync(packageJsonPath)) continue;
    let packageJson;
    try {
      packageJson = JSON.parse(fsApi.readFileSync(packageJsonPath, 'utf8'));
    } catch {
      continue;
    }
    if (typeof packageJson.scripts?.coverage !== 'string') continue;
    out.push({ name, dir, packageJsonPath, packageJson });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
