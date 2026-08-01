/** 历史控制器：快捷键、按钮、批注路由与 dispose 契约（fake target 测试）。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function controllerModule() {
  return import(
    pathToFileURL(
      path.join(root, 'apps/web/src/math/graph/graph-history-controller.js'),
    ).href,
  );
}

function makeFakeEventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    keydown(event) {
      for (const fn of listeners.get('keydown') || []) fn(event);
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
  };
}

function makeButton() {
  return {
    disabled: false,
    ariaDisabled: null,
    clickHandlers: [],
    setAttribute(name, value) {
      if (name === 'aria-disabled') this.ariaDisabled = value;
    },
    addEventListener(type, fn) {
      if (type === 'click') this.clickHandlers.push(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'click') {
        this.clickHandlers = this.clickHandlers.filter((item) => item !== fn);
      }
    },
    click() {
      for (const fn of this.clickHandlers) fn();
    },
  };
}

function makeFakeHistory() {
  return {
    undoCalls: 0,
    redoCalls: 0,
    canUndoValue: false,
    canRedoValue: false,
    subscribers: [],
    canUndo: function canUndo() { return this.canUndoValue; },
    canRedo: function canRedo() { return this.canRedoValue; },
    undo() { this.undoCalls += 1; },
    redo() { this.redoCalls += 1; },
    subscribe(fn) {
      this.subscribers.push(fn);
      return () => {
        this.subscribers = this.subscribers.filter((item) => item !== fn);
      };
    },
    notify() {
      for (const fn of this.subscribers) fn({ canUndo: this.canUndoValue, canRedo: this.canRedoValue });
    },
  };
}

function makeRoot(undoButton, redoButton) {
  return {
    querySelector(selector) {
      if (selector === '[data-graph-history-undo]') return undoButton;
      if (selector === '[data-graph-history-redo]') return redoButton;
      return null;
    },
  };
}

async function mount(options) {
  const { createGraphHistoryController } = await controllerModule();
  const eventTarget = makeFakeEventTarget();
  const undoButton = makeButton();
  const redoButton = makeButton();
  const history = makeFakeHistory();
  const controller = createGraphHistoryController({
    eventTarget,
    root: makeRoot(undoButton, redoButton),
    history,
    ...options,
  });
  return { eventTarget, undoButton, redoButton, history, controller };
}

function key(event) {
  return { ...event, preventDefault() { this.defaultPrevented = true; } };
}

test('Cmd+Z undoes, Cmd+Shift+Z and Ctrl+Y redo', async () => {
  const { eventTarget, history, controller } = await mount();
  history.canUndoValue = true;

  eventTarget.keydown(key({ key: 'z', metaKey: true, shiftKey: false, ctrlKey: false, target: { tagName: 'BODY', isContentEditable: false } }));
  assert.equal(history.undoCalls, 1);

  eventTarget.keydown(key({ key: 'z', metaKey: true, shiftKey: true, ctrlKey: false, target: { tagName: 'BODY', isContentEditable: false } }));
  assert.equal(history.redoCalls, 1);

  eventTarget.keydown(key({ key: 'z', metaKey: false, shiftKey: false, ctrlKey: true, target: { tagName: 'BODY', isContentEditable: false } }));
  assert.equal(history.undoCalls, 2);

  eventTarget.keydown(key({ key: 'z', metaKey: false, shiftKey: true, ctrlKey: true, target: { tagName: 'BODY', isContentEditable: false } }));
  assert.equal(history.redoCalls, 2);

  eventTarget.keydown(key({ key: 'y', metaKey: false, shiftKey: false, ctrlKey: true, target: { tagName: 'BODY', isContentEditable: false } }));
  assert.equal(history.redoCalls, 3);

  // Cmd+Y 不触发（计划只定义 Ctrl+Y）
  eventTarget.keydown(key({ key: 'y', metaKey: true, shiftKey: false, ctrlKey: false, target: { tagName: 'BODY', isContentEditable: false } }));
  assert.equal(history.redoCalls, 3);

  controller.dispose();
});

test('editable targets are exempt from shortcut interception', async () => {
  const { eventTarget, history, controller } = await mount();
  history.canUndoValue = true;
  const input = { tagName: 'INPUT', isContentEditable: false };
  const textarea = { tagName: 'TEXTAREA', isContentEditable: false };
  const contentEditable = { tagName: 'DIV', isContentEditable: true };

  for (const target of [input, textarea, contentEditable]) {
    const ev = key({ key: 'z', metaKey: true, shiftKey: false, ctrlKey: false, target });
    eventTarget.keydown(ev);
  }
  assert.equal(history.undoCalls, 0, 'editable targets must keep native undo');
  controller.dispose();
});

test('notes active routes undo to the notes controller', async () => {
  const notes = { isActive: () => true, undo: () => { notes.undoCalls = (notes.undoCalls || 0) + 1; } };
  const { eventTarget, history, controller } = await mount({ notes });
  history.canUndoValue = true;
  eventTarget.keydown(key({ key: 'z', metaKey: true, target: { tagName: 'BODY', isContentEditable: false } }));
  assert.equal(notes.undoCalls, 1);
  assert.equal(history.undoCalls, 0, 'notes mode must not touch graph history');
  controller.dispose();
});

test('buttons sync disabled state and respond to clicks', async () => {
  const { history, undoButton, redoButton, controller } = await mount();
  history.canUndoValue = true;
  history.notify();
  assert.equal(undoButton.disabled, false);
  assert.equal(redoButton.disabled, true);

  undoButton.click();
  assert.equal(history.undoCalls, 1);
  history.canRedoValue = true;
  history.notify();
  assert.equal(redoButton.disabled, false);
  redoButton.click();
  assert.equal(history.redoCalls, 1);
  controller.dispose();
});

test('mount and dispose keeps listener counts at zero', async () => {
  const { eventTarget, controller } = await mount();
  controller.dispose();
  assert.equal(eventTarget.listenerCount('keydown'), 0);
  assert.equal(eventTarget.listenerCount('click'), 0);

  // 重复 mount/dispose 不累积
  for (let i = 0; i < 3; i += 1) {
    const c = await mount();
    c.controller.dispose();
  }
  const { eventTarget: et, controller: last } = await mount();
  last.dispose();
  assert.equal(et.listenerCount('keydown'), 0);
});
