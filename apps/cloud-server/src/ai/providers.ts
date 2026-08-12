import { AppError } from '@xiaohuang/domain-core';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ProviderChatInput = {
  provider: string;
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
};

export type ProviderChatResult = {
  text: string;
  model: string;
};

const PROVIDER_BASE: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
};

const DEFAULT_TIMEOUT_MS = 30_000;

function providerBase(provider: string): string {
  const base = PROVIDER_BASE[provider];
  if (!base) {
    throw new AppError('CREDENTIAL_INVALID', '不支持的模型供应商');
  }
  return base;
}

function readFailureDetail(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const err = (body as { error?: { message?: unknown } }).error;
  if (err && typeof err.message === 'string') return err.message.slice(0, 200);
  return '';
}

function redactKey(text: string, apiKey: string): string {
  if (!apiKey) return text;
  return text.split(apiKey).join('[REDACTED]');
}

/**
 * OpenAI-compatible Chat Completions (DeepSeek + OpenAI).
 * Never returns or logs the API key.
 */
export async function callProviderChat(input: ProviderChatInput): Promise<ProviderChatResult> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new AppError('AI_REQUEST', '当前运行环境不支持网络请求');
  }

  const url = `${providerBase(input.provider)}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens ?? 512,
      }),
      signal: controller.signal,
    });

    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const detail = redactKey(readFailureDetail(parsed), input.apiKey);
      throw new AppError('AI_REQUEST', detail || '模型服务暂不可用');
    }

    const content =
      (parsed as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices?.[0]
        ?.message?.content;
    const text = typeof content === 'string' ? content.trim() : '';
    const model =
      typeof (parsed as { model?: unknown } | null)?.model === 'string'
        ? (parsed as { model: string }).model
        : input.model;
    return { text, model };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new AppError('AI_TIMEOUT', 'AI 服务响应超时，请稍后重试');
    }
    throw new AppError('AI_REQUEST', 'AI 服务连接失败，请检查网络后重试');
  } finally {
    clearTimeout(timer);
  }
}
