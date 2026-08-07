/**
 * UiController 合同（spec §8.1）：框架无关的 typed DOM controller。
 * element 是真实 HTMLElement（运行时）；测试用 test-kit fake DOM（鸭子类型）。
 */
export interface UiController<Props, Events = Record<string, unknown>> {
  element: HTMLElement;
  update(next: Partial<Props>): void;
  on(event: keyof Events, handler: (payload: unknown) => void): () => void;
  dispose(): void;
}

/** 所有组件共享的基础 Props。 */
export interface BaseProps {
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  'aria-label'?: string;
}

/** 安全文本输出：组件一律用 textContent，禁止不可信 innerHTML。 */
export function setText(el: HTMLElement, text: string): void {
  el.textContent = text;
}

/** 状态 class 应用（is-disabled/is-loading）。
 *  注意：is-error 不由这里管理——error 状态类与组件自身 kind/error 语义
 *  （如 StatusProps.kind='error'）冲突，由各组件显式控制。 */
export function applyStates(el: HTMLElement, props: Pick<BaseProps, 'disabled' | 'loading'>): void {
  el.classList.toggle('is-disabled', Boolean(props.disabled));
  el.classList.toggle('is-loading', Boolean(props.loading));
}
