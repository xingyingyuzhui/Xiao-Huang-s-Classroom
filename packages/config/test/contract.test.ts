/** config 包合同：版本常量与 Node 基线。 */
import { describe, expect, it } from 'vitest';
import { APP_VERSION, MIN_NODE_MAJOR } from '../src/index.js';

describe('@xiaohuang/config', () => {
  it('导出统一应用版本与 Node 基线', () => {
    expect(typeof APP_VERSION).toBe('string');
    expect(APP_VERSION.length).toBeGreaterThan(0);
    expect(MIN_NODE_MAJOR).toBe(20);
  });
});
