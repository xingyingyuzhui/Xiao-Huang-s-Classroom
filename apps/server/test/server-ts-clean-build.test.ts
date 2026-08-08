/**
 * Server TS 干净构建链合同（R1）。
 * （D-test 批次：node:test → vitest 迁移，行为逐字保持；execFileSync 构建
 * 需要 >5s，显式设置 test timeout）
 *
 * 用临时副本模拟干净环境（不触碰生产 apps/server/dist，保证与并行
 * server 测试隔离）：
 * 1. 无 dist 的副本中，构建命令生成 settings-policy 产物。
 * 2. 无产物时加载失败（运行时真实依赖产物）。
 * 3. 构建后产物可加载（单一产物合同）。
 * 4. stage 脚本含"产物缺失时主动构建"逻辑。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = require(path.join(dirname, '../../../test/helpers/repo-root.js'));

/** 临时副本：复制 server 的 TS 源码 + tsup 配置（无 dist） */
function makeCleanCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-server-clean-'));
  fs.mkdirSync(path.join(dir, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src/services'), { recursive: true });
  fs.copyFileSync(
    path.join(root, 'apps/server/src/domain/settings-policy.ts'),
    path.join(dir, 'src/domain/settings-policy.ts'),
  );
  fs.copyFileSync(
    path.join(root, 'apps/server/src/services/settings-service.ts'),
    path.join(dir, 'src/services/settings-service.ts'),
  );
  fs.copyFileSync(
    path.join(root, 'apps/server/tsup.config.ts'),
    path.join(dir, 'tsup.config.ts'),
  );
  const tsconfig = JSON.parse(
    fs.readFileSync(path.join(root, 'apps/server/tsconfig.json'), 'utf8'),
  );
  tsconfig.extends = './tsconfig.base.json'; // 副本内相对路径
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
  fs.copyFileSync(
    path.join(root, 'tsconfig.base.json'),
    path.join(dir, 'tsconfig.base.json'),
  );
  // 复用仓库 node_modules（只读），tsup/typescript 在副本内可解析
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: '@xiaohuang/server', private: true, type: 'commonjs' }),
  );
  // B2：真实 settings.ts（tsup entry）+ 其 inline 依赖（utils）
  fs.mkdirSync(path.join(dir, 'src/routes'), { recursive: true });
  fs.copyFileSync(
    path.join(root, 'apps/server/src/routes/settings.ts'),
    path.join(dir, 'src/routes/settings.ts'),
  );
  fs.mkdirSync(path.join(dir, 'src/utils'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src/routes/ai'), { recursive: true });
  fs.copyFileSync(
    path.join(root, 'apps/server/src/routes/ai/lesson.ts'),
    path.join(dir, 'src/routes/ai/lesson.ts'),
  );
  fs.copyFileSync(
    path.join(root, 'apps/server/src/routes/ai/molecules.ts'),
    path.join(dir, 'src/routes/ai/molecules.ts'),
  );
  fs.copyFileSync(
    path.join(root, 'apps/server/src/routes/ai/quiz.ts'),
    path.join(dir, 'src/routes/ai/quiz.ts'),
  );
  fs.copyFileSync(
    path.join(root, 'apps/server/src/routes/ai/chemistry.ts'),
    path.join(dir, 'src/routes/ai/chemistry.ts'),
  );
  fs.mkdirSync(path.join(dir, 'src/routes/chemistry'), { recursive: true });
  fs.copyFileSync(
    path.join(root, 'apps/server/src/routes/chemistry/quiz.ts'),
    path.join(dir, 'src/routes/chemistry/quiz.ts'),
  );
  fs.copyFileSync(
    path.join(root, 'apps/server/src/routes/chemistry/molecules.ts'),
    path.join(dir, 'src/routes/chemistry/molecules.ts'),
  );
  fs.copyFileSync(
    path.join(root, 'apps/server/src/routes/chemistry/students.ts'),
    path.join(dir, 'src/routes/chemistry/students.ts'),
  );
  fs.copyFileSync(
    path.join(root, 'apps/server/src/routes/chemistry/reactions.ts'),
    path.join(dir, 'src/routes/chemistry/reactions.ts'),
  );
  fs.copyFileSync(
    path.join(root, 'apps/server/src/routes/chemistry/labs.ts'),
    path.join(dir, 'src/routes/chemistry/labs.ts'),
  );
  fs.copyFileSync(
    path.join(root, 'apps/server/src/routes/chemistry/lesson-packs.ts'),
    path.join(dir, 'src/routes/chemistry/lesson-packs.ts'),
  );
  fs.copyFileSync(
    path.join(root, 'apps/server/src/routes/chemistry/mastery.ts'),
    path.join(dir, 'src/routes/chemistry/mastery.ts'),
  );
  fs.copyFileSync(
    path.join(root, 'apps/server/src/routes/chemistry/balance-scripts.ts'),
    path.join(dir, 'src/routes/chemistry/balance-scripts.ts'),
  );
  fs.copyFileSync(
    path.join(root, 'apps/server/src/routes/chemistry/offline-quiz.ts'),
    path.join(dir, 'src/routes/chemistry/offline-quiz.ts'),
  );
  fs.copyFileSync(
    path.join(root, 'apps/server/src/routes/ai/math.ts'),
    path.join(dir, 'src/routes/ai/math.ts'),
  );
  for (const f of ['response.js', 'ai-config.js', 'ai-request.js', 'molecule-validate.js', 'quiz-assist-limit.js', 'lab-schema.js', 'balance-script-schema.js', 'eq-sides.js']) {
    fs.copyFileSync(path.join(root, 'apps/server/src/utils', f), path.join(dir, 'src/utils', f));
  }
  // 模拟 settings.js 的产物引用（与生产同一相对结构 routes → ../../dist）
  fs.writeFileSync(
    path.join(dir, 'src/routes/settings.js'),
    "module.exports = require('../../dist/domain/settings-policy.js');\n",
  );
  return dir;
}

test('干净副本（无 dist）：server build 生成 policy 产物且路由可加载', () => {
  const dir = makeCleanCopy();
  try {
    const policyPath = path.join(dir, 'dist/domain/settings-policy.js');
    assert.equal(fs.existsSync(policyPath), false, '前置：副本无 dist');
    // 无产物时加载必须失败
    assert.throws(
      () => require(path.join(dir, 'src/routes/settings.js')),
      /settings-policy/,
      '无产物时路由加载失败（运行时真实依赖）',
    );
    // 构建（cwd=副本，tsup 读本地配置）
    execFileSync(process.execPath, [path.join(root, 'node_modules/tsup/dist/cli-default.js')], {
      cwd: dir,
      stdio: 'pipe',
      env: { ...process.env, NODE_PATH: path.join(root, 'node_modules') },
    });
    assert.ok(fs.existsSync(policyPath), 'build 后产物必须存在');
    const policy = require(policyPath);
    assert.equal(policy.validateIconDataUrl('data:image/png;base64,AAAA') !== null, true);
    // C1：service 产物同样生成且行为可用（薄转发依赖）
    const servicePath = path.join(dir, 'dist/services/settings-service.js');
    assert.ok(fs.existsSync(servicePath), 'build 后 service 产物必须存在');
    const service = require(servicePath);
    const result = service.loadSubjectSettings({ queryOne: () => null });
    assert.equal(result.ok, true, '无记录回退默认设置');
    // 构建后路由可加载（单一产物合同）
    assert.doesNotThrow(() => require(path.join(dir, 'src/routes/settings.js')), '构建后路由加载成功');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 180000);

test('settings.ts 使用单一产物合同（无双路径 try/catch，B2 后指向 TS 权威源）', () => {
  const src = fs.readFileSync(path.join(root, 'apps/server/src/routes/settings.ts'), 'utf8');
  const requireRefs = src.match(/require\([^)]*settings-(policy|service)[^)]*\)/g) || [];
  assert.ok(requireRefs.length >= 1, 'require 产物路径（policy/service）');
  assert.doesNotMatch(src, /try \{[^}]*settings-(policy|service)/, '不得用 try/catch 双路径掩盖');
});

test('stage 脚本含产物缺失时主动构建逻辑', () => {
  const stage = fs.readFileSync(path.join(root, 'scripts/stage-electron-server.js'), 'utf8');
  assert.match(stage, /dist.*domain.*settings-policy/, 'stage 检查 server 产物路径');
  assert.match(stage, /先构建 @xiaohuang\/server/, 'stage 主动构建 server');
});

test('tsup 配置唯一（空骨架 tsup.config.js 已删除）', () => {
  assert.equal(fs.existsSync(path.join(root, 'apps/server/tsup.config.js')), false, '空骨架配置必须删除');
  assert.ok(fs.existsSync(path.join(root, 'apps/server/tsup.config.ts')), '真实配置保留');
});

test('server package.json 提供标准 build/test/typecheck 任务', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'apps/server/package.json'), 'utf8'),
  );
  for (const task of ['build', 'test', 'typecheck']) {
    assert.equal(typeof pkg.scripts?.[task], 'string', `apps/server 必须有 ${task} 脚本`);
  }
});
