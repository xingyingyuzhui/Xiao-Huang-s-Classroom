/**
 * 数学教室相关源码语法烟测：避免 Vite 动态 import 才暴露的 parse 失败
 * （如 try/if 少写闭合 `}`，会在打开「课堂」Tab 时才炸）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = require('../helpers/repo-root.js');

function walkJs(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJs(p, acc);
    else if (ent.name.endsWith('.js') || ent.name.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

test('math classroom modules parse with node --check', () => {
  const dirs = [
    path.join(root, 'apps/web/src/math'),
    path.join(root, 'apps/web/src/subjects/classrooms'),
  ];
  const files = dirs.flatMap((d) => walkJs(d)).filter((f) => {
    const base = path.basename(f);
    // classroom 相关 + 各 lab 入口
    return (
      f.includes(`${path.sep}math${path.sep}`) ||
      base === 'math-classroom.ts' ||
      base.startsWith('math-')
    );
  });

  assert.ok(files.some((f) => f.endsWith(`${path.sep}classroom${path.sep}entry.js`)));

  const failures = [];
  for (const file of files) {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) {
      failures.push(`${path.relative(root, file)}: ${(r.stderr || r.stdout || '').trim()}`);
    }
  }
  assert.equal(failures.length, 0, failures.join('\n\n'));
});

test('generateMathQuiz useLab branch is properly closed', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/math/classroom/entry.js'),
    'utf8',
  );
  // 回归：if (opts.useLab) 块后必须独立进入 quizGenerate，不能吞掉 try 的闭合
  assert.match(
    src,
    /if\s*\(\s*opts\.useLab\s*\)\s*\{[\s\S]*?if\s*\(\s*!topics\.length\s*\)\s*topics\s*=\s*\[snap\.label\];\s*\}/,
  );
  assert.match(src, /async function generateMathQuiz[\s\S]*?\}\s*catch\s*\(\s*err\s*\)\s*\{/);
});
