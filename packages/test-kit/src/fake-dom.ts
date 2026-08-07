/**
 * Fake DOM：可绑定/解绑 listener 的元素 + 按 id 查找的 document。
 * 用于 UI controller 合同测试（不依赖浏览器）。
 */
export interface FakeElement {
  id: string;
  hidden: boolean;
  value: string;
  textContent: string;
  innerHTML: string;
  dataset: Record<string, string>;
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
    hidden: false,
    value: '',
    textContent: '',
    innerHTML: '',
    dataset: {},
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
