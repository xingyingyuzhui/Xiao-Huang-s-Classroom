import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  hasCloudAiChat,
  runCloudAi,
  setCloudAiChat,
} from '../../apps/web/src/shared/api/cloud-ai-bridge.js';

describe('cloud AI bridge', () => {
  beforeEach(() => {
    setCloudAiChat(null);
  });

  afterEach(() => {
    setCloudAiChat(null);
  });

  it('rejects when not registered', async () => {
    expect(hasCloudAiChat()).toBe(false);
    await expect(runCloudAi('lessonExplain', { topic: '二次函数' })).rejects.toThrow(
      '请先登录后再使用云端 AI',
    );
  });

  it('sends chat messages and returns lesson text', async () => {
    const calls: unknown[] = [];
    setCloudAiChat(async (input) => {
      calls.push(input);
      return { text: '二次函数开口由 a 决定。', model: 'test' };
    });
    const result = await runCloudAi('lessonExplain', {
      topic: '二次函数',
      subjectId: 'math',
    });
    expect(result.text).toContain('开口');
    expect(calls).toHaveLength(1);
    const first = calls[0] as { messages: Array<{ role: string }> };
    expect(first.messages[0]?.role).toBe('system');
    expect(first.messages[1]?.role).toBe('user');
  });

  it('parses quiz JSON from fenced model output', async () => {
    setCloudAiChat(async () => ({
      text: '```json\n{"questions":[{"id":"q1","stem":"1+1","options":["1","2","3","4"],"answer":1,"knowledge":"算术","hint":"加法","explain":"1+1=2"}]}\n```',
    }));
    const result = await runCloudAi('quizGenerate', { count: 1, subjectId: 'math' });
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].answer).toBe(1);
    expect(result.paperId).toBeNull();
  });

  it('does not call the model for quizScore', async () => {
    let called = 0;
    setCloudAiChat(async () => {
      called += 1;
      return { text: 'nope' };
    });
    const result = await runCloudAi('quizScore', {});
    expect(called).toBe(0);
    expect(result.score).toBe(0);
    expect(result.comment).toMatch(/尚未同步/);
  });
});
