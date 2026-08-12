import { describe, test, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function load<T = unknown>(rel: string): Promise<T> {
  return import(pathToFileURL(path.join(root, rel)).href + `?t=${Date.now()}`) as Promise<T>;
}

/* ── Minimal fake DOM (sufficient for @xiaohuang/ui createElement chain) ── */

interface FakeElement {
  tagName: string;
  type: string;
  id: string;
  textContent: string;
  value: string;
  hidden: boolean;
  disabled: boolean;
  autocomplete: string;
  placeholder: string;
  children: FakeElement[];
  attrs: Record<string, string>;
  dataset: Record<string, string>;
  style: Record<string, string> & { setProperty(k: string, v: string): void };
  listeners: Map<string, Array<(ev?: unknown) => void>>;
  parent: FakeElement | null;
  className: string;
  innerHTML: string;
  classList: {
    _s: Set<string>;
    add(...names: string[]): void;
    remove(...names: string[]): void;
    toggle(name: string, force?: boolean): boolean;
    contains(name: string): boolean;
  };
  addEventListener(type: string, fn: (ev?: unknown) => void): void;
  removeEventListener(type: string, fn: (ev?: unknown) => void): void;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getAttribute(name: string): string | null;
  appendChild(child: FakeElement): FakeElement;
  append(...children: unknown[]): void;
  replaceChildren(...children: unknown[]): void;
  remove(): void;
  querySelector(sel: string): FakeElement | null;
  querySelectorAll(sel: string): FakeElement[];
  click(): void;
  focus(): void;
}

function makeFakeElement(tag = 'div'): FakeElement {
  const classes = new Set<string>();
  const listeners = new Map<string, Array<(ev?: unknown) => void>>();
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    type: '',
    id: '',
    textContent: '',
    value: '',
    hidden: false,
    disabled: false,
    autocomplete: '',
    placeholder: '',
    children: [],
    attrs: {},
    dataset: {},
    style: Object.assign({}, { setProperty(k: string, v: string) { (el.style as any)[k] = v; } }),
    listeners,
    parent: null,
    className: '',
    innerHTML: '',
    classList: {
      _s: classes,
      add(...names: string[]) { names.forEach((n) => classes.add(n)); },
      remove(...names: string[]) { names.forEach((n) => classes.delete(n)); },
      toggle(name: string, force?: boolean): boolean {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name); else classes.delete(name);
        return on;
      },
      contains(name: string) { return classes.has(name); },
    },
    addEventListener(type: string, fn: (ev?: unknown) => void) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)!.push(fn);
    },
    removeEventListener(type: string, fn: (ev?: unknown) => void) {
      const arr = listeners.get(type);
      if (arr) listeners.set(type, arr.filter((f) => f !== fn));
    },
    setAttribute(name: string, value: string) { el.attrs[name] = String(value); },
    removeAttribute(name: string) { delete el.attrs[name]; },
    getAttribute(name: string) {
      return Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null;
    },
    appendChild(child: FakeElement) {
      child.parent = el;
      el.children.push(child);
      return child;
    },
    append(...children: unknown[]) {
      for (const c of children) {
        if (c && typeof c === 'object' && 'tagName' in (c as any)) el.appendChild(c as FakeElement);
      }
    },
    replaceChildren(...children: unknown[]) {
      el.children = [];
      el.append(...children);
    },
    remove() {
      if (el.parent) {
        const idx = el.parent.children.indexOf(el);
        if (idx >= 0) el.parent.children.splice(idx, 1);
        el.parent = null;
      }
    },
    querySelector(sel: string): FakeElement | null {
      return findBySelector(el, sel);
    },
    querySelectorAll(sel: string): FakeElement[] {
      return findAllBySelector(el, sel);
    },
    click() {
      const fns = listeners.get('click') || [];
      for (const fn of fns) fn({ preventDefault() {} });
    },
    focus() {},
  };
  Object.defineProperty(el, 'className', {
    get() { return [...classes].join(' '); },
    set(value: string) {
      classes.clear();
      String(value).split(/\s+/).filter(Boolean).forEach((n) => classes.add(n));
    },
  });
  Object.defineProperty(el, 'textContent', {
    get() {
      let txt = el._text ?? '';
      for (const c of el.children) txt += (c as any).textContent ?? '';
      return txt;
    },
    set(value: string) {
      (el as any)._text = String(value ?? '');
      el.children = [];
    },
  });
  (el as any)._text = '';
  return el;
}

function matchesClass(el: FakeElement, cls: string): boolean {
  return el.classList._s.has(cls);
}

function matchesSelector(el: FakeElement, sel: string): boolean {
  if (sel.startsWith('.')) return matchesClass(el, sel.slice(1));
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  return el.tagName === sel.toUpperCase();
}

function findBySelector(root: FakeElement, sel: string): FakeElement | null {
  for (const child of root.children) {
    if (matchesSelector(child, sel)) return child;
    const found = findBySelector(child, sel);
    if (found) return found;
  }
  return null;
}

function findAllBySelector(root: FakeElement, sel: string): FakeElement[] {
  const result: FakeElement[] = [];
  for (const child of root.children) {
    if (matchesSelector(child, sel)) result.push(child);
    result.push(...findAllBySelector(child, sel));
  }
  return result;
}

function installFakeDOM() {
  const body = makeFakeElement('body');
  const fakeDoc = {
    body,
    documentElement: makeFakeElement('html'),
    title: '',
    activeElement: null,
    createElement(tag: string) { return makeFakeElement(tag); },
    querySelector(sel: string) { return findBySelector(body, sel); },
    querySelectorAll(sel: string) { return findAllBySelector(body, sel); },
    getElementById() { return null; },
    addEventListener() {},
    removeEventListener() {},
  };
  (globalThis as any).document = fakeDoc;
  (globalThis as any).HTMLElement = class {};
  (globalThis as any).HTMLInputElement = class {};
  (globalThis as any).HTMLButtonElement = class {};
  (globalThis as any).requestAnimationFrame = (fn: () => void) => setTimeout(fn, 0);
  return { body, doc: fakeDoc };
}

/* ── Tests ── */

beforeEach(() => {
  installFakeDOM();
});

describe('formatRelativeTime', () => {
  test('刚刚 for recent timestamps', async () => {
    const { formatRelativeTime } = await load<any>('apps/web/src/sync/sync-panel.ts');
    expect(formatRelativeTime(Date.now() - 5000)).toBe('刚刚');
  });

  test('N 分钟前', async () => {
    const { formatRelativeTime } = await load<any>('apps/web/src/sync/sync-panel.ts');
    expect(formatRelativeTime(Date.now() - 3 * 60_000)).toBe('3 分钟前');
  });

  test('N 小时前', async () => {
    const { formatRelativeTime } = await load<any>('apps/web/src/sync/sync-panel.ts');
    expect(formatRelativeTime(Date.now() - 2 * 3600_000)).toBe('2 小时前');
  });

  test('从未同步 for null', async () => {
    const { formatRelativeTime } = await load<any>('apps/web/src/sync/sync-panel.ts');
    expect(formatRelativeTime(null)).toBe('从未同步');
  });
});

describe('renderSyncPanel', () => {
  test('shows pending count and sync button', async () => {
    const { renderSyncPanel } = await load<any>('apps/web/src/sync/sync-panel.ts');
    const container = makeFakeElement('div');
    renderSyncPanel(container as any, {
      status: {
        phase: 'idle',
        pendingCount: 5,
        conflictCount: 0,
        lastSyncedAt: null,
        lastError: null,
        online: true,
      },
      onSync: () => {},
      onViewConflicts: () => {},
    });

    expect((container as any).textContent).toContain('5 项待上传');
    const btn = findBySelector(container, '.ui-btn');
    expect(btn).toBeTruthy();
    expect((btn as any).textContent).toContain('同步');
    expect(btn!.disabled).toBe(false);
  });

  test('disables sync button during pushing phase', async () => {
    const { renderSyncPanel } = await load<any>('apps/web/src/sync/sync-panel.ts');
    const container = makeFakeElement('div');
    renderSyncPanel(container as any, {
      status: {
        phase: 'pushing',
        pendingCount: 0,
        conflictCount: 0,
        lastSyncedAt: null,
        lastError: null,
        online: true,
      },
      onSync: () => {},
      onViewConflicts: () => {},
    });

    const btn = findBySelector(container, '.ui-btn');
    expect(btn).toBeTruthy();
    expect(btn!.attrs['disabled']).toBeDefined();
  });
});

describe('renderClassSwitcher', () => {
  test('renders class list with active indicator', async () => {
    const { renderClassSwitcher } = await load<any>('apps/web/src/workspace/class-switcher.ts');
    const container = makeFakeElement('div');
    const now = new Date().toISOString();
    renderClassSwitcher(container as any, {
      classes: [
        { id: 'cls_1', accountId: 'acc_1', name: '一班', archived: false, deletedAt: null, createdAt: now, updatedAt: now },
        { id: 'cls_2', accountId: 'acc_1', name: '二班', archived: false, deletedAt: null, createdAt: now, updatedAt: now },
      ],
      activeClassId: 'cls_1',
      onSwitch: () => {},
      onCreate: async () => {},
      onDelete: async () => {},
    });

    const items = findAllBySelector(container, '.class-switcher-item');
    expect(items.length).toBe(3);
    expect((items[0] as any).textContent).toContain('个人空间');
    expect(items[0].attrs['aria-selected']).toBe('false');
    expect(items[1].attrs['aria-selected']).toBe('true');
    expect(matchesClass(items[1], 'is-active')).toBe(true);
  });
});

describe('showConflictDialog', () => {
  test('renders conflict actions', async () => {
    const { showConflictDialog } = await load<any>('apps/web/src/sync/conflict-dialog.ts');
    showConflictDialog({
      conflicts: [
        {
          conflictId: 'c1',
          resourceType: 'graph',
          resourceId: 'g1',
          snapshot: { local: 'v1', cloud: 'v2', base: null },
          supportsDuplicateLocal: true,
          resolvedAt: null,
          resolution: null,
        },
      ],
      onResolve: () => {},
      onClose: () => {},
    });

    const body = (globalThis as any).document.body as FakeElement;
    const card = findBySelector(body, '.conflict-card');
    expect(card).toBeTruthy();
    const buttons = findAllBySelector(card!, 'button');
    expect(buttons.length).toBe(3);
    const labels = buttons.map((b) => (b as any).textContent);
    expect(labels).toContain('保留本地版本');
    expect(labels).toContain('使用云端版本');
    expect(labels).toContain('两者都保留');
  });
});
