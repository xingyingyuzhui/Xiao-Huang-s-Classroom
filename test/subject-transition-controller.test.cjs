const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const controllerUrl = pathToFileURL(
  path.join(root, 'src/subjects/bookshelf/transition-controller.js'),
).href;

function createFakeClock() {
  let now = 0;
  /** @type {{ id: number, at: number, fn: () => void }[]} */
  let q = [];
  let seq = 1;
  return {
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
  };
}

test('controller shows lab only after cover opaque and lab prepared', async () => {
  const { createTransitionController } = await import(controllerUrl);
  const clock = createFakeClock();
  const log = [];
  /** @type {null | (() => void)} */
  let fireOpaque = null;

  const controller = createTransitionController(
    {
      beginEnterFocus: () => log.push('focus'),
      beginEnterBook: () => log.push('book'),
      playEnterCover: ({ onOpaque }) => {
        log.push('cover-start');
        fireOpaque = onOpaque;
      },
      playExitCover: () => {},
      prepareLab: async () => {
        log.push('lab-prep');
      },
      prepareHub: async () => {},
      showLab: (sid) => log.push(`show-lab:${sid}`),
      enableLab: () => log.push('enable-lab'),
      showHub: () => log.push('show-hub'),
    },
    {
      machine: {
        clock,
        timings: {
          enterBookMs: 10,
          enterPageMs: 20,
          labInteractiveMs: 5,
        },
      },
    },
  );

  const id = controller.requestEnter('chemistry');
  assert.ok(id);
  clock.advance(20);
  assert.ok(log.includes('cover-start'));
  assert.equal(log.includes('show-lab:chemistry'), false);

  await controller._labPrep();
  assert.ok(log.includes('lab-prep'));
  assert.equal(log.includes('show-lab:chemistry'), false);

  fireOpaque?.();
  assert.ok(log.includes('show-lab:chemistry'));
  clock.advance(5);
  assert.ok(log.includes('enable-lab'));
  assert.equal(controller.phase(), 'lab-idle');
});

test('controller return waits for opaque + hub prepared before hub-visible', async () => {
  const { createTransitionController } = await import(controllerUrl);
  const clock = createFakeClock();
  const log = [];
  /** @type {null | (() => void)} */
  let fireOpaque = null;
  /** @type {null | (() => void)} */
  let fireCleared = null;

  const controller = createTransitionController(
    {
      playEnterCover: ({ onOpaque }) => {
        queueMicrotask(onOpaque);
      },
      playExitCover: ({ onOpaque, onCleared }) => {
        log.push('exit-cover');
        fireOpaque = onOpaque;
        fireCleared = onCleared;
      },
      prepareLab: async () => {},
      prepareHub: async () => {
        log.push('hub-prep');
      },
      showLab: () => log.push('show-lab'),
      showHub: () => log.push('show-hub'),
      enableHub: () => log.push('enable-hub'),
      beginReturnBook: () => log.push('return-book'),
    },
    {
      machine: {
        clock,
        timings: {
          enterBookMs: 0,
          enterPageMs: 0,
          labInteractiveMs: 0,
          hubInteractiveMs: 5,
        },
      },
    },
  );

  controller.requestEnter('chemistry');
  clock.advance(0);
  // playEnterCover queues onOpaque on microtask; wait lab prep + opaque
  await controller._labPrep();
  await Promise.resolve();
  clock.advance(1);
  assert.equal(controller.phase(), 'lab-idle');

  controller.requestReturn();
  assert.ok(log.includes('exit-cover'));
  await controller._hubPrep();
  assert.ok(log.includes('hub-prep'));
  fireOpaque?.();
  assert.ok(log.includes('return-book'));
  fireCleared?.();
  assert.ok(log.includes('show-hub'));
  clock.advance(5);
  assert.ok(log.includes('enable-hub'));
  assert.equal(controller.phase(), 'hub-idle');
});
