import { describe, expect, it } from 'vitest';
import { subjectManifestSchema } from '../src/subject.js';
import { ipcRequestSchema } from '../src/ipc.js';

describe('subject manifest / IPC schema', () => {
  it('合法 manifest 通过', () => {
    const r = subjectManifestSchema.safeParse({
      id: 'chemistry',
      status: 'ready',
      intro: { title: '化学', description: '实验室' },
      cover: { variants: ['v1'] },
      classroom: { defaultPanel: 'lab', panels: ['lab', 'periodic'] },
    });
    expect(r.success).toBe(true);
  });

  it('未知 status 被拒绝', () => {
    const r = subjectManifestSchema.safeParse({
      id: 'x',
      status: 'ghost',
      intro: {},
      cover: { variants: [] },
      classroom: {},
    });
    expect(r.success).toBe(false);
  });

  it('ipcChannelSchema 含 app:get-version 且为唯一 allowlist 源', async () => {
    const { ipcChannelSchema } = await import('../src/ipc.js');
    expect(ipcChannelSchema.options).toContain('app:get-version');
    expect(ipcChannelSchema.options.length).toBeGreaterThanOrEqual(1);
  });

  it('未登记 IPC channel 被拒绝', () => {
    const r = ipcRequestSchema.safeParse({ channel: 'shell:exec-anything', payload: {} });
    expect(r.success).toBe(false);
    const ok = ipcRequestSchema.safeParse({ channel: 'app:get-version', payload: {} });
    expect(ok.success).toBe(true);
  });
});
