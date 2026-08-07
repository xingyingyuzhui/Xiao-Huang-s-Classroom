import { describe, expect, it } from 'vitest';
import { graphDocumentSchema, GRAPH_DOCUMENT_VERSION } from '../src/persistence.js';

const validDoc = {
  schemaVersion: 2,
  functions: [
    {
      id: 'f1',
      name: '',
      kind: 'preset',
      preset: 'quadratic',
      coeffs: { a: 1, b: 0, c: 0 },
      colorSlot: 0,
      explicitColor: null,
      visible: true,
      locked: false,
    },
    { id: 'f2', name: '自定义', kind: 'custom', expr: 'x^2+1' },
  ],
  points: [
    {
      id: 'U1',
      x: 0.5,
      y: 0.25,
      constraint: { kind: 'followFunction', functionId: 'f1', anchorX: 0.5 },
    },
    { id: 'U2', x: 1, y: 2, constraint: { kind: 'free' } },
  ],
  constructions: [{ id: 'C1', kind: 'segment', pointIds: ['U1', 'U2'] }],
};

describe('GraphDocumentV2 schema', () => {
  it('合法文档通过 parse', () => {
    const r = graphDocumentSchema.safeParse(validDoc);
    expect(r.success).toBe(true);
  });

  it('functions 为空被拒绝', () => {
    const r = graphDocumentSchema.safeParse({ ...validDoc, functions: [] });
    expect(r.success).toBe(false);
  });

  it('未知 function kind 被拒绝', () => {
    const r = graphDocumentSchema.safeParse({
      ...validDoc,
      functions: [{ ...validDoc.functions[0], kind: 'unknown' }],
    });
    expect(r.success).toBe(false);
  });

  it('非有限系数被拒绝', () => {
    const r = graphDocumentSchema.safeParse({
      ...validDoc,
      functions: [{ ...validDoc.functions[0], coeffs: { a: NaN, b: 0, c: 0 } }],
    });
    expect(r.success).toBe(false);
  });

  it('非法 explicitColor 被拒绝；合法 hex 通过', () => {
    const bad = graphDocumentSchema.safeParse({
      ...validDoc,
      functions: [{ ...validDoc.functions[0], explicitColor: 'red;background:url(x)' }],
    });
    expect(bad.success).toBe(false);
    const good = graphDocumentSchema.safeParse({
      ...validDoc,
      functions: [{ ...validDoc.functions[0], explicitColor: '#b45309' }],
    });
    expect(good.success).toBe(true);
  });

  it('intersection targetIds 少于 2 被拒绝', () => {
    const r = graphDocumentSchema.safeParse({
      ...validDoc,
      points: [{ id: 'U3', x: 0, y: 0, constraint: { kind: 'intersection', targetIds: ['f1'] } }],
    });
    expect(r.success).toBe(false);
  });

  it('版本常量固定为 2', () => {
    expect(GRAPH_DOCUMENT_VERSION).toBe(2);
  });
});
