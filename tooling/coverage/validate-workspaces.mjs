/**
 * 校验 coverage workspace 是否具备 config / include / thresholds / 测试。
 * 支持注入 packagesRoot，便于临时 fixture 红绿测试。
 */
import fs from 'node:fs';
import path from 'node:path';
import { discoverCoverageWorkspaces } from './discover-workspaces.mjs';

/**
 * @param {{ packagesRoot: string, fsApi?: typeof fs, pathApi?: import('node:path').PlatformPath }} options
 * @returns {{ workspaces: string[], violations: string[] }}
 */
export function validateCoverageWorkspaces({ packagesRoot, fsApi = fs, pathApi = path }) {
  const discovered = discoverCoverageWorkspaces({ packagesRoot, fsApi, pathApi });
  /** @type {string[]} */
  const violations = [];
  const workspaces = discovered.map((w) => w.name);

  for (const ws of discovered) {
    const cfgPath = pathApi.join(ws.dir, 'vitest.config.ts');
    if (!fsApi.existsSync(cfgPath)) {
      violations.push(`${ws.name}: 缺少 vitest.config.ts`);
      continue;
    }
    const cfg = fsApi.readFileSync(cfgPath, 'utf8');

    if (!/include:\s*\[\s*['"]src\/\*\*['"]\s*\]/.test(cfg)) {
      violations.push(`${ws.name}: coverage include 必须是 src/**`);
    }
    for (const exclude of ['dist/**', 'coverage/**', 'test/**']) {
      if (!cfg.includes(exclude)) {
        violations.push(`${ws.name}: 缺少 coverage exclude ${exclude}`);
      }
    }

    const thresholds = [...cfg.matchAll(/(statements|branches|functions|lines):\s*(\d+)/g)];
    if (thresholds.length === 0) {
      violations.push(`${ws.name}: 必须定义 thresholds`);
    } else if (!thresholds.every((m) => Number(m[2]) > 0)) {
      violations.push(`${ws.name}: thresholds 必须全部 > 0`);
    }

    const testDir = pathApi.join(ws.dir, 'test');
    if (!fsApi.existsSync(testDir)) {
      violations.push(`${ws.name}: 缺少 test/ 目录`);
    } else {
      const testFiles = fsApi
        .readdirSync(testDir)
        .filter((f) => f.endsWith('.test.ts') || f.endsWith('.test.js'));
      if (testFiles.length < 1) {
        violations.push(`${ws.name}: coverage script 存在但无测试文件`);
      }
    }
  }

  return { workspaces, violations };
}
