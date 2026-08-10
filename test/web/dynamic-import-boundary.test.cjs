/**
 * 动态导入结构合同（Task 8 Step 7）。
 *
 * 断言「假 lazy / 假动态导入」不回归：
 * - manifest 不动态 import classroom-loader（零依赖，registry 已静态加载，
 *   动态写法无法把模块移出 chunk，只会制造 mixed-import warning）；
 * - manifest 不静态 import classrooms/registry.js（保持 manifest ↔ registry 无环）；
 * - board-notes 不对已静态消费的模块（board-compass / object-style-panel）做动态 import；
 * - app shell（main.js / shell.js）仍不静态 import JSXGraph / KaTeX / 重型课堂 feature。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

function src(rel) {
  return fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');
}

/** 提取动态 import 的 specifier */
function dynamicImports(code) {
  const out = [];
  const re = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(code)) !== null) out.push(m[1]);
  return out;
}

/** 提取静态 import 的 specifier */
function staticImports(code) {
  const out = [];
  const re = /(?:^|\n)\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code)) !== null) out.push(m[1]);
  return out;
}

test('manifest 不动态 import classroom-loader（静态导入，registry 已静态加载）', () => {
  const code = src('subjects/manifest.js');
  const dyn = dynamicImports(code);
  assert.ok(
    !dyn.some((s) => s.includes('classroom-loader')),
    `manifest.js 不得动态 import classroom-loader: ${dyn.join(', ')}`,
  );
  const stat = staticImports(code);
  assert.ok(
    stat.some((s) => s === './classroom-loader.js'),
    `manifest.js 应静态导入 classroom-loader: ${stat.join(', ')}`,
  );
});

test('manifest 不静态 import classrooms/registry.js（保持无环）', () => {
  const code = src('subjects/manifest.js');
  const stat = staticImports(code);
  assert.ok(
    !stat.some((s) => s.includes('classrooms/registry')),
    `manifest.js 不得静态导入 registry: ${stat.join(', ')}`,
  );
});

test('board-notes 不对已静态消费模块做动态 import', () => {
  const code = src('math/shared/board-notes.js');
  const dyn = dynamicImports(code);
  assert.deepEqual(
    dyn,
    [],
    `board-notes.js 不得保留动态 import（compass/panel 已静态消费）: ${dyn.join(', ')}`,
  );
  const stat = staticImports(code);
  assert.ok(
    stat.some((s) => s === './board-compass.js'),
    'board-notes.js 应静态导入 board-compass.js',
  );
  assert.ok(
    stat.some((s) => s === './object-style-panel.js'),
    'board-notes.js 应静态导入 object-style-panel.js',
  );
});

test('app shell 仍不静态 import JSXGraph / KaTeX / 重型课堂 feature', () => {
  for (const rel of ['main.js', 'app/shell.js']) {
    const code = src(rel);
    const stat = staticImports(code);
    const heavy = stat.filter((s) => {
      const bare = s.replace(/^['"]|['"]$/g, '');
      return (
        /^jsxgraph($|\/)/.test(bare) ||
        /^katex($|\/)/.test(bare) ||
        /math\/graph/.test(bare) ||
        /math\/classroom/.test(bare) ||
        /math\/plane/.test(bare) ||
        /math\/trig/.test(bare) ||
        /math\/sequence/.test(bare) ||
        /math\/solid/.test(bare) ||
        /chemistry\/(molecule|battle|electron|ai-classroom)/.test(bare)
      );
    });
    assert.deepEqual(
      heavy,
      [],
      `${rel} 不得静态 import JSXGraph/KaTeX/重型 feature: ${heavy.join(', ')}`,
    );
  }
});
