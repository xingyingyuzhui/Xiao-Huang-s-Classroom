/**
 * Graph 名称编辑控制器：hooks 安装与 dispose 释放。
 */
import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { createGraphNameEditController } from '../../apps/web/src/math/graph/graph-name-edit-controller.js';

function makeEl(patch: Record<string, unknown> = {}) {
  return {
    _mathBaseName: '点A',
    _mathSelectLabel: '点A',
    name: '点A',
    ...patch,
  };
}

type NameHooks = {
  canEditName?: (el: Record<string, unknown>) => boolean;
  getNameKind?: (el: Record<string, unknown>) => 'point' | 'line';
  getName?: (el: Record<string, unknown>) => string;
  setName?: (el: Record<string, unknown>, name: string) => void;
} | null;

describe('createGraphNameEditController', () => {
  test('mount installs hooks; dispose clears setNameEditHooks(null)', () => {
    let hooks: NameHooks | { sentinel: boolean } = { sentinel: true };
    const setNameEditHooks = (h: NameHooks) => {
      hooks = h;
    };
    const state = {
      functions: [] as Array<{ curve: unknown }>,
      constructions: [] as Array<Record<string, unknown>>,
      graphStore: null as null | {
        getDocument: () => { points: Array<{ id: string; locked?: boolean }>; constructions: unknown[] };
        dispatch: (action: unknown) => void;
      },
    };
    const ctrl = createGraphNameEditController({
      state,
      setNameEditHooks,
      applyDisplayName: (el: Record<string, unknown>, name: string) => {
        el._mathBaseName = name;
      },
      detectObjectKind: (el: Record<string, unknown>) => (el._mathConstrId ? 'line' : 'point'),
      findUserRec: () => null,
      userPointIdOf: () => null,
    });

    ctrl.mount();
    assert.equal(typeof (hooks as NameHooks)?.canEditName, 'function');
    assert.equal(typeof (hooks as NameHooks)?.setName, 'function');
    assert.equal((hooks as NameHooks)?.getName?.(makeEl()), '点A');
    assert.equal((hooks as NameHooks)?.getNameKind?.(makeEl({ _mathConstrId: 'c1' })), 'line');

    ctrl.dispose();
    assert.equal(hooks, null);
  });

  test('locked user point cannot edit; dispose drops store refs', () => {
    let hooks: NameHooks = null;
    const pointEl = makeEl({ _mathPointId: 'p1' });
    const store = {
      getDocument: () => ({
        points: [{ id: 'p1', locked: true, name: '点A' }],
        constructions: [],
      }),
      dispatch() {
        throw new Error('locked point must not dispatch');
      },
    };
    const state = {
      functions: [] as Array<{ curve: unknown }>,
      constructions: [] as Array<Record<string, unknown>>,
      graphStore: store,
    };
    const ctrl = createGraphNameEditController({
      state,
      setNameEditHooks: (h: NameHooks) => {
        hooks = h;
      },
      applyDisplayName: () => {},
      detectObjectKind: () => 'point',
      findUserRec: (el: Record<string, unknown>) => (el === pointEl ? { locked: true } : null),
      userPointIdOf: (el: Record<string, unknown>) => (el === pointEl ? 'p1' : null),
    });
    ctrl.mount();
    assert.equal(hooks?.canEditName?.(pointEl), false);
    hooks?.setName?.(pointEl, '点B');
    ctrl.dispose();
    assert.equal(hooks, null);
  });

  test('20× mount/dispose leaves hooks null', () => {
    let hooks: NameHooks | { keep: number } = { keep: 1 };
    const setNameEditHooks = (h: NameHooks) => {
      hooks = h;
    };
    const state = {
      functions: [] as Array<{ curve: unknown }>,
      constructions: [] as Array<Record<string, unknown>>,
      graphStore: null,
    };
    for (let i = 0; i < 20; i += 1) {
      const ctrl = createGraphNameEditController({
        state,
        setNameEditHooks,
        applyDisplayName: () => {},
        detectObjectKind: () => 'point',
        findUserRec: () => null,
        userPointIdOf: () => null,
      });
      ctrl.mount();
      ctrl.dispose();
    }
    assert.equal(hooks, null);
  });
});
