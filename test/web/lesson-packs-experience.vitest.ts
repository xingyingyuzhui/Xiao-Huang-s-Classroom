/**
 * 备课包（AI 课壳）U3 体验补丁合同测试（源合同，与 lesson-packs.vitest.ts 互不重叠）。
 *
 * 断言：
 * - 删除确认与同壳（lab/balance/quiz shell）语气统一：点名备课包（「」括号）、
 *   title/okText/danger 选项齐备；
 * - 保存防连点：savingPack 守卫 + 按钮禁用「保存中…」，失败路径恢复；
 * - 空态文案使用「」括号（不再直引号），可点击入口指向工具栏「新建备课包」。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import root from '../helpers/repo-root.js';

const SRC = path.join(root, 'apps/web/src/chemistry/ai-classroom/lesson-packs.js');

test('删除确认点名备课包并带完整 appConfirm 选项（与同壳语气统一）', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  assert.match(
    src,
    /await appConfirm\(`确定删除备课包「\$\{pack\.name\}」？`/,
    '删除确认用「」点名备课包（不再直引号）',
  );
  assert.match(src, /title: '删除备课包'/, '确认框标题为「删除备课包」');
  assert.match(src, /okText: '删除'/, '确认按钮文案为「删除」');
  assert.match(src, /danger: true/, '危险操作标记（与 balance-shell 删除一致）');
  assert.doesNotMatch(
    src,
    /确定删除备课包"|此操作不可撤销/,
    '不再使用直引号/冗余后缀（与同壳语气统一）',
  );
});

test('保存防连点：savingPack 守卫 + 按钮忙态，失败恢复', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  assert.match(src, /let savingPack = false;/, '保存在途状态标记');
  assert.match(src, /if \(savingPack\) return;/, '重复点击被守卫拦截');
  assert.match(src, /saveBtn\.disabled = true;/, '保存按钮进入禁用忙态');
  assert.match(src, /saveBtn\.textContent = '保存中…';/, '按钮文案切换「保存中…」');
  assert.match(src, /saveBtn\.disabled = false;/, '失败路径恢复按钮');
  assert.match(src, /saveBtn\.textContent = '保存';/, '失败路径恢复文案');
});

test('空态文案用「」括号并指向工具栏新建入口', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  assert.match(src, /还没有备课包。点击「新建备课包」创建第一个。/, '空态提示逐字保持');
  assert.doesNotMatch(src, /点击"新建备课包"/, '不再使用直引号');
});
