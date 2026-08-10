/**
 * 大厅返回编排接线（main 运行时质量恢复计划 Task 3）。
 *
 * 真实 import createSubjectHub（其默认 createStage = createBookshelfStage），
 * 通过注入 fake stage 工厂记录 playReturnFromLab() 收到的 subject meta：
 * - 返回大厅只消费 runtime manifest adapter（getSubjectMeta，manifest.js）；
 * - 默认/未知学科安全回退 chemistry；已知学科传 manifest 的 id/name；
 * - 不允许重新从 catalog.js 导入 getSubject 造成双入口。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

const HUB_URL = pathToFileURL(path.join(root, 'apps/web/src/subjects/hub.js')).href;

function makeFakeDom() {
  const ids = [
    'subjectHub',
    'bookshelfGl',
    'bookshelfClose',
    'bookshelfDetail',
    'bookshelfEnter',
    'bookshelfLock',
    'bookshelfPageFx',
  ];
  const els = new Map(
    ids.map((id) => [
      id,
      {
        id,
        hidden: false,
        setAttribute() {},
        querySelector: () => null,
        addEventListener() {},
        removeEventListener() {},
      },
    ]),
  );
  return {
    select: (sel) => els.get(String(sel).replace(/^#/, '')) || null,
    els,
  };
}

/**
 * 注入 fake stage 工厂：记录 createStage 收到的 opts 与 playReturnFromLab 收到的 meta。
 * @param {ReturnType<typeof makeFakeDom>} dom
 */
function makeFakeStageFactory(dom, log) {
  const factory = (opts) => {
    log.push({ event: 'createStage', opts });
    return {
      show() {},
      hide() {},
      relayout() {},
      syncTheme() {},
      playReturnFromLab(returnOpts) {
        log.push({ event: 'playReturnFromLab', returnOpts });
      },
    };
  };
  factory.dom = dom;
  return factory;
}

async function makeHub() {
  const { createSubjectHub } = await import(HUB_URL);
  const dom = makeFakeDom();
  const log = [];
  const hub = createSubjectHub({
    select: dom.select,
    onEnterSubject: () => {},
    onRevealHub: () => {},
    createStage: makeFakeStageFactory(dom, log),
  });
  return { hub, log, dom };
}

test('playReturnFromLab：默认回退 chemistry，且走 runtime manifest 的 id/name', async () => {
  const { hub, log } = await makeHub();
  hub.playReturnFromLab();
  const calls = log.filter((x) => x.event === 'playReturnFromLab');
  assert.equal(calls.length, 1, 'playReturnFromLab 恰好一次');
  assert.equal(calls[0].returnOpts.subjectId, 'chemistry', '默认学科为 chemistry');
  assert.equal(calls[0].returnOpts.subjectName, '化学', 'name 来自 runtime manifest');
  assert.equal(typeof calls[0].returnOpts.onDone, 'undefined');
});

test('playReturnFromLab：已知学科传 manifest 的 id/name；未知学科安全回退 chemistry', async () => {
  const { hub, log } = await makeHub();

  hub.playReturnFromLab({ subjectId: 'math' });
  const mathCall = log.filter((x) => x.event === 'playReturnFromLab').at(-1);
  assert.equal(mathCall.returnOpts.subjectId, 'math', '数学从 manifest 取 id');
  assert.equal(mathCall.returnOpts.subjectName, '数学', '数学从 manifest 取 name');

  hub.playReturnFromLab({ subjectId: 'alien-subject-42' });
  const fallback = log.filter((x) => x.event === 'playReturnFromLab').at(-1);
  assert.equal(fallback.returnOpts.subjectId, 'chemistry', '未知学科回退 chemistry');
  assert.equal(fallback.returnOpts.subjectName, '化学');
});

test('playReturnFromLab：透传 onDone', async () => {
  const { hub, log } = await makeHub();
  const onDone = () => {};
  hub.playReturnFromLab({ subjectId: 'math', onDone });
  const call = log.filter((x) => x.event === 'playReturnFromLab').at(-1);
  assert.equal(call.returnOpts.onDone, onDone, 'onDone 原样透传');
});

test('hub.js 返回大厅禁止重新导入 catalog.js 的 getSubject（保持 manifest 单入口）', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(path.join(root, 'apps/web/src/subjects/hub.js'), 'utf8');
  assert.doesNotMatch(src, /from '\.\/catalog\.js'/, 'hub.js 不得直接导入 catalog.js');
  assert.match(src, /getSubjectMeta/, 'hub.js 使用 manifest adapter getSubjectMeta');
});
