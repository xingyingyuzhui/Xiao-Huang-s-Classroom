/**
 * Fake DOM：可绑定/解绑 listener 的元素 + 按 id 查找的 document。
 * 用于 UI controller 合同测试（不依赖浏览器）。
 */
export interface FakeElement {
  id: string;
  className: string;
  hidden: boolean;
  value: string;
  checked: boolean;
  textContent: string;
  innerHTML: string;
  dataset: Record<string, string>;
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getAttribute(name: string): string | null;
  remove(): void;
  classList: {
    classes: Set<string>;
    add(...names: string[]): void;
    remove(...names: string[]): void;
    toggle(name: string, force?: boolean): boolean;
    contains(name: string): boolean;
  };
  style: { properties: Record<string, string>; setProperty(k: string, v: string): void };
  listeners: Record<string, Array<(event?: unknown) => void>>;
  addEventListener(type: string, fn: (event?: unknown) => void): void;
  removeEventListener(type: string, fn: (event?: unknown) => void): void;
  click(): void;
  listenersOf(type: string): number;
}

export function makeFakeElement(id: string): FakeElement {
  const el: FakeElement = {
    id,
    className: '',
    hidden: false,
    value: '',
    checked: false,
    textContent: '',
    innerHTML: '',
    dataset: {},
    attributes: {},
    setAttribute(name, value) {
      el.attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete el.attributes[name];
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(el.attributes, name)
        ? (el.attributes[name] ?? null)
        : null;
    },
    remove() {},
    classList: {
      classes: new Set<string>(),
      add(...names) {
        for (const n of names) this.classes.add(n);
      },
      remove(...names) {
        for (const n of names) this.classes.delete(n);
      },
      toggle(name, force) {
        if (force === undefined) {
          if (this.classes.has(name)) {
            this.classes.delete(name);
            return false;
          }
          this.classes.add(name);
          return true;
        }
        if (force) this.classes.add(name);
        else this.classes.delete(name);
        return force;
      },
      contains(name) {
        return this.classes.has(name);
      },
    },
    style: {
      properties: {},
      setProperty(k, v) {
        this.properties[k] = v;
      },
    },
    listeners: {},
    addEventListener(type, fn) {
      (el.listeners[type] = el.listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      el.listeners[type] = (el.listeners[type] || []).filter((f) => f !== fn);
    },
    click() {
      for (const fn of el.listeners.click || []) fn({ preventDefault() {} });
    },
    listenersOf(type) {
      return (el.listeners[type] || []).length;
    },
  };
  Object.defineProperty(el, 'className', {
    get() {
      return [...el.classList.classes].join(' ');
    },
    set(value: string) {
      el.classList.classes = new Set(String(value).split(/\s+/).filter(Boolean));
    },
  });
  return el;
}

export interface FakeDocument {
  elements: Map<string, FakeElement>;
  getElementById(id: string): FakeElement | null;
  register(id: string): FakeElement;
  createElement(tag: string): FakeElement;
  totalListeners(): number;
}

export function createFakeDocument(): FakeDocument {
  const elements = new Map<string, FakeElement>();
  return {
    elements,
    getElementById(id) {
      return elements.get(id) || null;
    },
    register(id) {
      const el = makeFakeElement(id);
      elements.set(id, el);
      return el;
    },
    createElement(tag) {
      return makeFakeElement(`el-${tag}`);
    },
    totalListeners() {
      let n = 0;
      for (const el of elements.values()) {
        for (const list of Object.values(el.listeners)) n += list.length;
      }
      return n;
    },
  };
}
