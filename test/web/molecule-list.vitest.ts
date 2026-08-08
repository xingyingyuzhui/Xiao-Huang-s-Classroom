/**
 * 分子列表（molecule/list.js）UI 库采用结构合同（计划 P6）。
 *
 * 断言点：
 * - 工具条主按钮（＋ 生成 / 编辑-保存）由 @xiaohuang/ui createButton 渲染，
 *   className 桥接旧 .mol-btn 样式（视觉零回归）；
 * - partial 不再静态声明这两个按钮，单一挂载点为 .mol-toolbar；
 * - ai.js 通过 setOnMoleculeAdd 注册「＋」入口，不再直接查 #btnAddMolecule；
 * - list.js 导出幂等 disposeMoleculeList（B5 合同：dispose 后可重建）。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import root from '../helpers/repo-root.js';

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const LIST = 'apps/web/src/chemistry/molecule/list.js';
const AI = 'apps/web/src/chemistry/molecule/ai.js';
const PANELS = 'apps/web/src/subjects/classrooms/partials/chemistry-panels.partial.html';

test('molecule list imports createButton from @xiaohuang/ui', () => {
  const src = source(LIST);
  assert.match(
    src,
    /import\s*\{[^}]*createButton[^}]*\}\s*from\s*['"]@xiaohuang\/ui['"]/,
    'createButton 必须从 @xiaohuang/ui 具名导入',
  );
});

test('toolbar buttons are created via createButton with mol-btn bridge classes', () => {
  const src = source(LIST);
  assert.match(src, /className:\s*'mol-btn mol-btn-add'/, '＋ 按钮桥接 mol-btn mol-btn-add');
  assert.match(src, /className:\s*'mol-btn mol-btn-edit'/, '编辑按钮桥接 mol-btn mol-btn-edit');
  assert.match(src, /mol-add-plus/, '＋ 图标仍为 strong.mol-add-plus 子节点');
  assert.match(src, /update\(\{ label: on \? '保存' : '编辑' \}\)/, '编辑模式文案逐字保持');
});

test('static toolbar buttons removed from partial (single JS mount point)', () => {
  const html = source(PANELS);
  assert.doesNotMatch(html, /id="btnAddMolecule"/, 'partial 不再声明 btnAddMolecule');
  assert.doesNotMatch(html, /id="btnEditMolecules"/, 'partial 不再声明 btnEditMolecules');
  assert.match(html, /class="mol-toolbar"/, '挂载点 .mol-toolbar 保留');
});

test('ai.js registers the add-molecule entry through setOnMoleculeAdd', () => {
  const src = source(AI);
  assert.match(src, /setOnMoleculeAdd\(\(\) => openGenModal\(\)\)/, '＋ 打开 AI 弹窗回调注册');
  assert.doesNotMatch(src, /btnAddMolecule/, 'ai.js 不再直接查询 #btnAddMolecule');
});

test('list module exports idempotent dispose and the add-molecule hook', () => {
  const src = source(LIST);
  assert.match(src, /export function setOnMoleculeAdd/, 'setOnMoleculeAdd 导出');
  assert.match(src, /export function disposeMoleculeList/, 'disposeMoleculeList 导出');
  assert.match(src, /addBtnController\?\.dispose\(\)/, '＋ 按钮控制器 dispose');
  assert.match(src, /editBtnController\?\.dispose\(\)/, '编辑按钮控制器 dispose');
});
