/**
 * 设置抽屉轻提示（P4.2）：操作成功/失败统一消费 @xiaohuang/ui createToast。
 * 源合同（node:test 可测部分）：settings.js 走 createToast、无残留内联 settings-status
 * 写入、返回控制器暴露 dispose；index.html 死状态元素已删。
 * 执行路径见 settings-toast-consumption.vitest.ts（session.js→session.ts 链路需 Vite 解析）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const settingsSrcPath = path.join(root, 'apps/web/src/shared/ui/settings.js');
const indexHtmlPath = path.join(root, 'apps/web/index.html');

test('settings.js 轻提示消费 createToast，内联 settings-status 写入已移除', () => {
  const src = fs.readFileSync(settingsSrcPath, 'utf8');
  assert.match(src, /import \{ createToast \} from '@xiaohuang\/ui';/);
  assert.match(src, /createToast\(\{/);
  assert.match(src, /durationMs: 2800/, '旧内联状态 2800ms 自动清除时限保持不变');
  assert.match(src, /kind: ok \? 'success' : 'error'/);
  assert.match(src, /document\.body\.appendChild\(toast\.element\)/);
  assert.doesNotMatch(src, /settings-status/, '不再写内联 settings-status');
  assert.doesNotMatch(src, /setStatus\(/, 'setStatus 内联助手已整体移除');
  assert.match(
    src,
    /dispose\(\)\s*\{\s*dismissActiveToast\(\)/,
    '返回控制器暴露 dispose 回收活动 toast',
  );
});

test('index.html 中四个死状态元素已删除', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  for (const id of ['themeStatus', 'brandStatus', 'defaultPageStatus', 'aiStatus']) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`), `#${id} 不应残留`);
  }
});
