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

describe('createGraphNameEditController', () => {
  test('mount installs hooks; dispose clears setNameEditHooks(null)', () => {
    let hooks: any = { sentinel: true };
    const setNameEditHooks = (h: any) => {
      hooks = h;
    };
    const state: any = {
      functions: [],
      constructions: [],
      graphStore: null,
    };
    const ctrl = createGraphNameEditController({
      state,
      setNameEditHooks,
      applyDisplayName: (el: any, name: string) => {
        el._mathBaseName = name;
      },
      detectObjectKind: (el: any) => (el._mathConstrId ? 'line' : 'point'),
      findUserRec: () => null,
      userPointIdOf: () => null,
    });

    ctrl.mount();
    assert.equal(typeof hooks?.canEditName, 'function');
    assert.equal(typeof hooks?.setName, 'function');
    assert.equal(hooks.getName(makeEl()), '点A');
    assert.equal(hooks.getNameKind(makeEl({ _mathConstrId: 'c1' })), 'line');

    ctrl.dispose();
    assert.equal(hooks, null);
  });

  test('locked user point cannot edit; dispose drops store refs', () => {
    let hooks: any = null;
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
    const state: any = {
      functions: [],
      constructions: [],
      graphStore: store,
    };
    const ctrl = createGraphNameEditController({
      state,
      setNameEditHooks: (h) => {
        hooks = h;
      },
      applyDisplayName: () => {},
      detectObjectKind: () => 'point',
      findUserRec: (el: any) => (el === pointEl ? { locked: true } : null),
      userPointIdOf: (el: any) => (el === pointEl ? 'p1' : null),
    });
    ctrl.mount();
    assert.equal(hooks.canEditName(pointEl), false);
    hooks.setName(pointEl, '点B');
    ctrl.dispose();
    assert.equal(hooks, null);
  });

  test('20× mount/dispose leaves hooks null', () => {
    let hooks: any = { keep: 1 };
    const setNameEditHooks = (h: any) => {
      hooks = h;
    };
    const state: any = { functions: [], constructions: [], graphStore: null };
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
