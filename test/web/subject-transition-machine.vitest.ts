import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import root from '../helpers/repo-root.js';
const machineUrl = pathToFileURL(
  path.join(root, 'apps/web/src/subjects/bookshelf/transition-machine.js'),
).href;

/**
 * 可手动推进的时钟
 */
function createFakeClock() {
  let now = 0;
  /** @type {{ id: number, at: number, fn: () => void }[]} */
  let q = [];
  let seq = 1;
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = seq++;
      q.push({ id, at: now + Math.max(0, ms), fn });
      q.sort((a, b) => a.at - b.at || a.id - b.id);
      return id;
    },
    clearTimeout(id) {
      q = q.filter((t) => t.id !== id);
    },
    advance(ms) {
      const target = now + ms;
      while (q.length && q[0].at <= target) {
        const t = q.shift();
        now = t.at;
        t.fn();
      }
      now = target;
    },
    flush() {
      while (q.length) {
        const t = q.shift();
        now = t.at;
        t.fn();
      }
    },
  };
}

test('enter waits for both opaque page and ready lab before lab-visible', async () => {
  const { createTransitionMachine } = await import(machineUrl);
  const events = [];
  const clock = createFakeClock();
  const machine = createTransitionMachine({
    clock,
    emit: (e) => events.push(e),
    timings: { enterBookMs: 380, enterPageMs: 1080, labInteractiveMs: 100 },
  });
  const id = machine.requestEnter('chemistry');
  clock.advance(1080);
  machine.reportPageOpaque(id);
  assert.deepEqual(
    events.map((e) => e.type),
    ['enter-focus', 'enter-book', 'enter-page'],
  );
  machine.reportLabReady(id);
  assert.equal(events.at(-1).type, 'lab-visible');
  clock.advance(100);
  assert.ok(events.some((e) => e.type === 'lab-interactive'));
  assert.equal(machine.phase(), 'lab-idle');
});

test('labReady before pageOpaque still waits for opaque', async () => {
  const { createTransitionMachine } = await import(machineUrl);
  const events = [];
  const clock = createFakeClock();
  const machine = createTransitionMachine({
    clock,
    emit: (e) => events.push(e),
    timings: { enterBookMs: 10, enterPageMs: 20, labInteractiveMs: 10 },
  });
  const id = machine.requestEnter('chemistry');
  clock.advance(20);
  machine.reportLabReady(id);
  assert.equal(events.some((e) => e.type === 'lab-visible'), false);
  machine.reportPageOpaque(id);
  assert.equal(events.at(-1).type, 'lab-visible');
});

test('return during enter invalidates stale enter reports', async () => {
  const { createTransitionMachine } = await import(machineUrl);
  const events = [];
  const clock = createFakeClock();
  const machine = createTransitionMachine({
    clock,
    emit: (e) => events.push(e),
    timings: { enterBookMs: 10, enterPageMs: 20 },
  });
  const enterId = machine.requestEnter('chemistry');
  clock.advance(20);
  const returnId = machine.requestReturn();
  assert.ok(returnId > enterId);
  machine.reportLabReady(enterId);
  machine.reportPageOpaque(enterId);
  assert.equal(
    events.some((e) => e.type === 'lab-visible' && e.id === enterId),
    false,
  );
  assert.equal(machine.phase(), 'neutral-cover');
});

test('return flow needs opaque then hub prepared then page cleared', async () => {
  const { createTransitionMachine } = await import(machineUrl);
  const events = [];
  const clock = createFakeClock();
  const machine = createTransitionMachine({
    clock,
    emit: (e) => events.push(e),
    timings: { hubInteractiveMs: 50 },
  });
  // force lab-idle
  const enterId = machine.requestEnter('chemistry');
  clock.advance(300);
  machine.reportPageOpaque(enterId);
  machine.reportLabReady(enterId);
  clock.advance(300);
  assert.equal(machine.phase(), 'lab-idle');

  const rid = machine.requestReturn();
  assert.equal(events.at(-1).type, 'exiting-cover');
  machine.reportPageOpaque(rid);
  assert.equal(machine.phase(), 'exiting-cover'); // still waiting hubPrepared
  machine.reportHubPrepared(rid);
  assert.equal(events.at(-1).type, 'exiting-book');
  machine.reportPageCleared(rid);
  assert.equal(events.at(-1).type, 'hub-visible');
  clock.advance(50);
  assert.equal(machine.phase(), 'hub-idle');
});

test('only commits the latest queued theme after settled', async () => {
  const { createTransitionMachine } = await import(machineUrl);
  const events = [];
  const clock = createFakeClock();
  const machine = createTransitionMachine({
    clock,
    emit: (e) => events.push(e),
    timings: { enterBookMs: 10, enterPageMs: 20, labInteractiveMs: 10 },
  });
  machine.requestEnter('chemistry');
  machine.requestTheme('stationery');
  machine.requestTheme('blackboard');
  assert.equal(events.some((e) => e.type === 'theme-commit'), false);
  const id = machine.id();
  clock.advance(20);
  machine.reportPageOpaque(id);
  machine.reportLabReady(id);
  clock.advance(20);
  const commits = events.filter((e) => e.type === 'theme-commit');
  assert.equal(commits.length, 1);
  assert.equal(commits[0].themeId, 'blackboard');
});

test('theme commits immediately when idle', async () => {
  const { createTransitionMachine } = await import(machineUrl);
  const events = [];
  const machine = createTransitionMachine({
    emit: (e) => events.push(e),
  });
  machine.requestTheme('pixel');
  assert.equal(events.at(-1).type, 'theme-commit');
  assert.equal(events.at(-1).themeId, 'pixel');
  assert.equal(machine.committedTheme(), 'pixel');
});

test('stale reports are ignored', async () => {
  const { createTransitionMachine } = await import(machineUrl);
  const events = [];
  const clock = createFakeClock();
  const machine = createTransitionMachine({
    clock,
    emit: (e) => events.push(e),
    timings: { enterBookMs: 0, enterPageMs: 0, labInteractiveMs: 0 },
  });
  const id1 = machine.requestEnter('chemistry');
  clock.advance(0);
  // complete enter
  machine.reportPageOpaque(id1);
  machine.reportLabReady(id1);
  clock.advance(1);
  assert.equal(machine.phase(), 'lab-idle');

  const id2 = machine.requestReturn();
  machine.reportPageOpaque(id1); // stale
  assert.equal(machine.phase(), 'exiting-cover');
  machine.reportPageOpaque(id2);
  machine.reportHubPrepared(id2);
  machine.reportPageCleared(id1); // stale
  assert.equal(machine.phase(), 'exiting-book');
  machine.reportPageCleared(id2);
  clock.advance(200);
  assert.equal(machine.phase(), 'hub-idle');
});

test('lab ready timeout emits failed-cover', async () => {
  const { createTransitionMachine } = await import(machineUrl);
  const events = [];
  const clock = createFakeClock();
  const machine = createTransitionMachine({
    clock,
    emit: (e) => events.push(e),
    timings: {
      enterBookMs: 0,
      enterPageMs: 0,
      labReadyTimeoutMs: 100,
      labInteractiveMs: 0,
    },
  });
  const id = machine.requestEnter('chemistry');
  clock.advance(0);
  machine.reportPageOpaque(id);
  // no labReady
  clock.advance(100);
  assert.equal(machine.phase(), 'failed-cover');
  assert.ok(events.some((e) => e.type === 'failed-cover' && e.reason === 'lab-timeout'));
  // recovery via return
  const rid = machine.requestReturn();
  assert.ok(rid);
  assert.equal(machine.phase(), 'exiting-cover');
});

test('neutral cover promotes to enter after opaque', async () => {
  const { createTransitionMachine } = await import(machineUrl);
  const events = [];
  const clock = createFakeClock();
  const machine = createTransitionMachine({
    clock,
    emit: (e) => events.push(e),
    timings: {
      enterBookMs: 5,
      enterPageMs: 10,
      hubInteractiveMs: 5,
      labInteractiveMs: 5,
    },
  });
  const enterId = machine.requestEnter('chemistry');
  clock.advance(10);
  const nid = machine.requestReturn();
  assert.equal(machine.phase(), 'neutral-cover');
  machine.reportNeutralCoverOpaque(nid);
  assert.equal(machine.phase(), 'exiting-cover');
  // reverse again to enter
  const eid = machine.requestEnter('chemistry');
  assert.equal(machine.phase(), 'neutral-cover');
  machine.reportNeutralCoverOpaque(eid);
  assert.equal(machine.phase(), 'enter-focus');
  clock.advance(10);
  machine.reportPageOpaque(machine.id());
  machine.reportLabReady(machine.id());
  clock.advance(20);
  assert.equal(machine.phase(), 'lab-idle');
  assert.ok(enterId);
});

test('ignore requestEnter while already entering', async () => {
  const { createTransitionMachine } = await import(machineUrl);
  const clock = createFakeClock();
  const machine = createTransitionMachine({
    clock,
    timings: { enterBookMs: 50, enterPageMs: 100 },
  });
  const a = machine.requestEnter('chemistry');
  const b = machine.requestEnter('chemistry');
  assert.equal(b, null);
  assert.equal(machine.id(), a);
});
