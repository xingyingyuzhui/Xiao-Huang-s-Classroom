import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function frameTask() {
  return import(
    pathToFileURL(
      path.join(root, 'apps/web/src/math/shared/frame-task.js'),
    ).href
  );
}

test('frame task coalesces repeated scheduling into one frame', async () => {
  const { createFrameTask } = await frameTask();
  const queued = new Map();
  let nextId = 1;
  let runs = 0;
  const task = createFrameTask(() => { runs += 1; }, {
    requestFrame: (callback) => {
      const id = nextId++;
      queued.set(id, callback);
      return id;
    },
    cancelFrame: (id) => queued.delete(id),
  });

  task.schedule();
  task.schedule();
  task.schedule();

  assert.equal(queued.size, 1);
  assert.equal(task.pending(), true);
  const callback = queued.values().next().value;
  queued.clear();
  callback();
  assert.equal(runs, 1);
  assert.equal(task.pending(), false);

  task.schedule();
  assert.equal(queued.size, 1);
});

test('frame task cancellation prevents stale work', async () => {
  const { createFrameTask } = await frameTask();
  const queued = new Map();
  let runs = 0;
  const task = createFrameTask(() => { runs += 1; }, {
    requestFrame: (callback) => {
      queued.set(7, callback);
      return 7;
    },
    cancelFrame: (id) => queued.delete(id),
  });

  task.schedule();
  task.cancel();

  assert.equal(queued.size, 0);
  assert.equal(task.pending(), false);
  assert.equal(runs, 0);
});

