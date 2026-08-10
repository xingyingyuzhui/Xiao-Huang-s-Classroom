/** 变换播放控制器：fake scheduler 下的提交/取消/生命周期契约。 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function controllerModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/transform-controller.js')).href,
  );
}

function makeFakeFrame() {
  const frames = [];
  let elapsed = 0;
  return {
    frames,
    requestFrame: (fn) => {
      frames.push(fn);
      return frames.length;
    },
    cancelFrame: (id) => {
      frames[id - 1] = null;
    },
    /** 推进 n 帧（elapsed 跨调用累积） */
    advance(n, stepMs = 100) {
      for (let i = 0; i < n; i += 1) {
        const fn = frames.find((f) => f);
        if (!fn) break;
        const idx = frames.indexOf(fn);
        frames[idx] = null;
        elapsed += stepMs;
        fn(elapsed);
      }
    },
  };
}

test('play commits the endpoint exactly once with linear frames', async () => {
  const { createTransformController } = await controllerModule();
  const frame = makeFakeFrame();
  const frames = [];
  const commits = [];
  const controller = createTransformController({
    requestFrame: frame.requestFrame,
    cancelFrame: frame.cancelFrame,
    documentTarget: null,
    reducedMotion: false,
    now: () => 0,
  });
  controller.play({
    fnId: 'f1',
    preset: 'quadratic',
    from: { a: 1, b: 0, c: 0 },
    to: { a: 3, b: 0, c: 0 },
    duration: 500,
    onFrame: (c) => frames.push(c.a),
    onCommit: (c) => commits.push(c),
  });
  assert.equal(controller.isPlaying(), true);
  frame.advance(4, 100); // 100..400ms
  assert.equal(frames.length, 4, 'four transient frames');
  assert.deepEqual(commits, [], 'no commit before completion');
  frame.advance(2, 100); // 500..600ms → 完成
  assert.deepEqual(commits, [{ a: 3, b: 0, c: 0 }], 'exactly one final commit');
  assert.equal(controller.isPlaying(), false);
});

test('stop restores the start point and commits it once', async () => {
  const { createTransformController } = await controllerModule();
  const frame = makeFakeFrame();
  const commits = [];
  const controller = createTransformController({
    requestFrame: frame.requestFrame,
    cancelFrame: frame.cancelFrame,
    documentTarget: null,
    reducedMotion: false,
    now: () => 0,
  });
  controller.play({
    fnId: 'f1',
    preset: 'quadratic',
    from: { a: 1, b: 0, c: 0 },
    to: { a: 3, b: 0, c: 0 },
    duration: 500,
    onFrame: () => {},
    onCommit: (c) => commits.push(c),
  });
  frame.advance(2, 100);
  controller.stop();
  assert.deepEqual(commits, [{ a: 1, b: 0, c: 0 }], 'cancel restores the start');
  assert.equal(controller.isPlaying(), false);
});

test('reduced motion jumps straight to the endpoint', async () => {
  const { createTransformController } = await controllerModule();
  const frame = makeFakeFrame();
  const frames = [];
  const commits = [];
  const controller = createTransformController({
    requestFrame: frame.requestFrame,
    cancelFrame: frame.cancelFrame,
    documentTarget: null,
    reducedMotion: true,
    now: () => 0,
  });
  controller.play({
    fnId: 'f1',
    preset: 'quadratic',
    from: { a: 1, b: 0, c: 0 },
    to: { a: 3, b: 0, c: 0 },
    duration: 500,
    onFrame: (c) => frames.push(c.a),
    onCommit: (c) => commits.push(c),
  });
  assert.deepEqual(frames, [3], 'single final frame');
  assert.deepEqual(commits, [{ a: 3, b: 0, c: 0 }]);
  assert.equal(frame.frames.some((f) => f), false, 'no scheduled frames');
});

test('visibility hidden cancels the animation and restores', async () => {
  const { createTransformController } = await controllerModule();
  const frame = makeFakeFrame();
  const listeners = {};
  const documentTarget = {
    visibilityState: 'visible',
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    removeEventListener: (type) => {
      delete listeners[type];
    },
  };
  const commits = [];
  const controller = createTransformController({
    requestFrame: frame.requestFrame,
    cancelFrame: frame.cancelFrame,
    documentTarget,
    reducedMotion: false,
    now: () => 0,
  });
  controller.play({
    fnId: 'f1',
    preset: 'quadratic',
    from: { a: 1, b: 0, c: 0 },
    to: { a: 3, b: 0, c: 0 },
    duration: 500,
    onFrame: () => {},
    onCommit: (c) => commits.push(c),
  });
  documentTarget.visibilityState = 'hidden';
  listeners.visibilitychange();
  assert.deepEqual(commits, [{ a: 1, b: 0, c: 0 }], 'hidden restores start');
  controller.dispose();
  assert.equal(listeners.visibilitychange, undefined, 'dispose removes listener');
});

test('dispose cancels frames and later frames do nothing', async () => {
  const { createTransformController } = await controllerModule();
  const frame = makeFakeFrame();
  const commits = [];
  const controller = createTransformController({
    requestFrame: frame.requestFrame,
    cancelFrame: frame.cancelFrame,
    documentTarget: null,
    reducedMotion: false,
    now: () => 0,
  });
  controller.play({
    fnId: 'f1',
    preset: 'quadratic',
    from: { a: 1, b: 0, c: 0 },
    to: { a: 3, b: 0, c: 0 },
    duration: 500,
    onFrame: () => {},
    onCommit: (c) => commits.push(c),
  });
  controller.dispose();
  frame.advance(10);
  assert.deepEqual(commits, [{ a: 1, b: 0, c: 0 }], 'dispose restores once; further frames inert');
  assert.equal(commits.length, 1);
});
