/**
 * 学科元数据单一入口合同（B4 / 关 D13）。
 *
 * 断言：catalog.js（SUBJECTS/getSubject）在 subjects 目录内只允许被
 * manifest.js 直连；hub/chrome/shell/classroom 一律经 manifest.js
 * （subjectManifest/getSubjectMeta）取学科元数据，不得直连 catalog。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const subjectsDir = path.join(root, 'apps/web/src/subjects');

/** 递归收集 subjects 目录下全部 .js 文件（含 classrooms/ 子目录） */
function collectJsFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectJsFiles(full, acc);
    else if (e.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

test('catalog.js 在 subjects 目录内只被 manifest.js 直连（唯一权威入口）', () => {
  const files = collectJsFiles(subjectsDir);
  const directConsumers = [];
  for (const full of files) {
    const src = fs.readFileSync(full, 'utf8');
    if (/(from|import)\s+['"](\.\.?\/)+catalog\.js['"]/.test(src)) {
      directConsumers.push(path.relative(subjectsDir, full));
    }
  }
  assert.deepEqual(directConsumers, ['manifest.js'], 'catalog 只允许 manifest.js 直连');
});

test('home-shell 教室元数据经 manifest 取，不得直连 catalog', () => {
  const src = fs.readFileSync(path.join(subjectsDir, 'classrooms/home-shell.js'), 'utf8');
  assert.doesNotMatch(src, /catalog\.js/, 'home-shell 不得 import catalog.js');
  assert.match(src, /manifest\.js/, 'home-shell 必须从 manifest.js 取元数据');
});

test('hub/chrome/shell 消费方统一从 manifest.js 取学科元数据', () => {
  for (const rel of ['hub.js', 'chrome.js']) {
    const src = fs.readFileSync(path.join(subjectsDir, rel), 'utf8');
    assert.match(src, /manifest\.js/, `${rel} 必须从 manifest.js 取元数据`);
  }
  const shell = fs.readFileSync(path.join(root, 'apps/web/src/app/shell.js'), 'utf8');
  assert.match(shell, /manifest\.js/, 'shell.js 必须从 manifest.js 取元数据');
});
