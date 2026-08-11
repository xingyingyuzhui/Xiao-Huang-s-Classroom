/**
 * 对象名称分段编辑器 + name-keypad 生命周期。
 */
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import root from '../helpers/repo-root.js';
import { createObjectNameEditor } from '../../apps/web/src/math/shared/object-name-editor.js';
import { hideNameKeypad } from '../../apps/web/src/math/shared/name-keypad.js';

function makeSegButton(seg: string, text: string) {
  const listeners: Record<string, Array<(ev?: unknown) => void>> = {};
  return {
    textContent: text,
    classList: {
      classes: new Set<string>(),
      toggle(name: string, on?: boolean) {
        if (on) this.classes.add(name);
        else this.classes.delete(name);
        return on;
      },
    },
    getAttribute(name: string) {
      return name === 'data-seg' ? seg : null;
    },
    closest(sel: string) {
      return sel.includes('data-seg') ? this : null;
    },
    addEventListener(type: string, fn: (ev?: unknown) => void) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    removeEventListener(type: string, fn: (ev?: unknown) => void) {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
    listeners,
  };
}

function makeRoot() {
  const nameRow = { hidden: false };
  const styleBtn = makeSegButton('style', '样式');
  const letterBtn = makeSegButton('letter', 'A');
  const numberBtn = makeSegButton('number', '—');
  const hostListeners: Record<string, Array<(ev?: unknown) => void>> = {};
  const nameSegmentsHost = {
    addEventListener(type: string, fn: (ev?: unknown) => void) {
      (hostListeners[type] = hostListeners[type] || []).push(fn);
    },
    removeEventListener(type: string, fn: (ev?: unknown) => void) {
      hostListeners[type] = (hostListeners[type] || []).filter((f) => f !== fn);
    },
    hostListeners,
  };
  return {
    root: {
      querySelector(sel: string) {
        if (sel === '[data-role="nameSegments"]') return nameSegmentsHost;
        if (sel === '[data-seg="style"]') return styleBtn;
        if (sel === '[data-seg="letter"]') return letterBtn;
        if (sel === '[data-seg="number"]') return numberBtn;
        if (sel === '[data-field="nameRow"]') return nameRow;
        return null;
      },
    } as unknown as HTMLElement,
    nameRow,
    styleBtn,
    letterBtn,
    numberBtn,
    nameSegmentsHost,
  };
}

afterEach(() => {
  try {
    hideNameKeypad();
  } catch {
    /* no document in node */
  }
});

describe('createObjectNameEditor', () => {
  test('paint/commit segments via hooks', () => {
    const { root, letterBtn, numberBtn } = makeRoot();
    let saved: string | null = null;
    const target = { name: '点A1' };
    const editor = createObjectNameEditor({
      root,
      getTarget: () => target,
      getNameEditHooks: () => ({
        canEditName: () => true,
        getNameKind: () => 'point',
        getName: () => '点A1',
        setName: (_el: Record<string, unknown>, formatted: string) => {
          saved = formatted;
        },
      }),
      detectObjectKind: () => 'point',
      setFieldVisible: () => {},
    });
    editor.bind();
    editor.paintNameSegments();
    assert.equal(letterBtn.textContent, 'A');
    assert.equal(numberBtn.textContent, '1');
    editor.commitNameSegments({ letter: 'B', number: '2' });
    assert.equal(saved, '点B2');
    editor.dispose();
  });

  test('name-keypad cancels outside RAF on hide', () => {
    const src = fs.readFileSync(
      path.join(root, 'apps/web/src/math/shared/name-keypad.js'),
      'utf8',
    );
    assert.match(src, /let outsideRaf = 0/);
    assert.match(src, /cancelAnimationFrame\(outsideRaf\)/);
    assert.match(src, /outsideRaf = window\.requestAnimationFrame/);
    assert.match(src, /export function hideNameKeypad/);
  });

  test('editor hide() and dispose() call hideNameKeypad', () => {
    const src = fs.readFileSync(
      path.join(root, 'apps/web/src/math/shared/object-name-editor.js'),
      'utf8',
    );
    assert.match(src, /function hide\(\) \{\s*hideNameKeypad\(\);/s);
    assert.match(src, /function dispose\(\) \{\s*hideNameKeypad\(\);/s);
    const panelSrc = fs.readFileSync(
      path.join(root, 'apps/web/src/math/shared/object-style-panel.js'),
      'utf8',
    );
    assert.match(panelSrc, /nameEditor\.hide\(\)/);
    assert.match(panelSrc, /hideNameKeypad\(\)/);
    assert.match(panelSrc, /nameEditor\.dispose\(\)/);
    assert.match(panelSrc, /createObjectNameEditor/);
  });

  test('20× bind/dispose does not accumulate click listeners', () => {
    const { root, nameSegmentsHost } = makeRoot();
    const target = { name: '直线l' };
    for (let i = 0; i < 20; i += 1) {
      const editor = createObjectNameEditor({
        root,
        getTarget: () => target,
        getNameEditHooks: () => ({
          canEditName: () => true,
          getNameKind: () => 'line',
          getName: () => '直线l',
          setName: () => {},
        }),
        detectObjectKind: () => 'line',
        setFieldVisible: () => {},
      });
      editor.bind();
      editor.hide();
      editor.dispose();
    }
    assert.equal(nameSegmentsHost.hostListeners.click?.length || 0, 0);
  });
});
