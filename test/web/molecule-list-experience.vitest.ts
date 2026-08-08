/**
 * 分子列表（U3 高流量面体验补丁）合同测试。
 *
 * 断言（源合同 + 样式合同，与 molecule-list.test.cjs 互不重叠）：
 * - 删除确认点名分子（「」括号），并带 title/okText/danger 选项（与函数侧栏一致）；
 * - 删除期间防连点：deletingIds 守卫 + 按钮 disabled/is-deleting 忙态；
 * - 删除完成焦点归还稳定工具按钮（列表重建后不丢键盘流）；
 * - 空态为 createButton 构建的可操作入口（非 innerHTML 模板按钮），样式走主题令牌；
 * - 加载失败路径不再使用内联硬编码色（#b91c1c），改走 .mol-list-error 令牌色。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import root from '../helpers/repo-root.js';

const LIST = path.join(root, 'apps/web/src/chemistry/molecule/list.js');
const CSS = path.join(root, 'apps/web/src/shared/styles/_molecule.css');

test('删除确认点名分子，并带 appConfirm 选项（标题/确定文案/危险态）', () => {
  const src = fs.readFileSync(LIST, 'utf8');
  assert.match(
    src,
    /确定删除「\$\{mol\?\.name \|\| '该分子卡片'\}」？/,
    '确认文案用「」点名分子（与函数侧栏删除确认语气一致）',
  );
  assert.match(src, /title: '删除分子'/, '确认框标题保留');
  assert.match(src, /okText: '删除'/, '确认框按钮文案为「删除」');
  assert.match(src, /danger: true/, '危险操作标记保留');
});

test('删除期间防连点：deletingIds 守卫 + 按钮忙态，取消/失败均恢复', () => {
  const src = fs.readFileSync(LIST, 'utf8');
  assert.match(src, /if \(!id \|\| deletingIds\.has\(id\)\) return;/, '重复点击被守卫拦截');
  assert.match(src, /deletingIds\.add\(id\)/, '确认前即占位（拦截 appConfirm 队列叠加）');
  assert.match(src, /btn\.disabled = true/, '删除按钮进入禁用忙态');
  assert.match(src, /is-deleting/, 'busy 样式类 is-deleting');
  assert.match(src, /btn\.disabled = false/, '取消/失败路径恢复按钮');
  assert.match(src, /deletingIds\.delete\(id\)/, 'finally 释放占位');
});

test('删除完成后焦点归还稳定工具按钮（列表重建后仍可达）', () => {
  const src = fs.readFileSync(LIST, 'utf8');
  assert.match(
    src,
    /editBtnController\?\.element\?\.focus\?\.\(\)/,
    '焦点归还编辑/保存工具按钮（不随卡片重建丢失）',
  );
});

test('空态为 createButton 可操作入口，样式与工具条 ＋ 按钮同构', () => {
  const src = fs.readFileSync(LIST, 'utf8');
  assert.match(src, /function disposeEmptyState\(\)/, '空态控制器有释放路径');
  assert.match(src, /emptyBtnController = addBtn/, '空态按钮受控制器管理');
  assert.match(
    src,
    /createButton\(\{[\s\S]*?className: 'mol-btn mol-btn-add'/,
    '空态入口走 createButton（非 innerHTML 模板按钮）',
  );
  assert.match(src, /'aria-label': '用 AI 生成分子'/, '空态/工具条按钮均有可读名称');
  assert.match(src, /molList\.replaceChildren\(\)/, '空态清空走 DOM API（非 innerHTML 模板）');
  assert.match(src, /box\.appendChild\(addBtn\.element\)/, '空态入口按钮经 DOM 挂载');
  const css = fs.readFileSync(CSS, 'utf8');
  assert.match(css, /\.mol-empty\s*\{/, '空态容器样式');
  assert.match(css, /\.mol-empty-hint\s*\{/, '空态提示行样式');
});

test('加载失败路径无内联硬编码色，错误态走主题令牌', () => {
  const src = fs.readFileSync(LIST, 'utf8');
  assert.doesNotMatch(src, /#b91c1c/, '内联硬编码红色已移除');
  assert.doesNotMatch(src, /style="[^"]*color/, '不再有任何内联颜色样式');
  assert.match(src, /mol-list-error/, '错误态走样式类');
  const css = fs.readFileSync(CSS, 'utf8');
  assert.match(css, /\.mol-list-error\s*\{[\s\S]*?var\(--danger\)/, '错误态使用 --danger 令牌');
});
