import type { ApiResponse } from '@/types';

export interface StreamResult {
  content: string;
  error?: string;
}

export interface StreamRequestOptions {
  signal?: AbortSignal;
}

/**
 * 发起 SSE 流式 POST 请求，通过 onChunk 回调逐块返回内容
 */
export async function streamRequest(
  url: string,
  body: unknown,
  onChunk: (chunk: string) => void,
  options: StreamRequestOptions = {}
): Promise<StreamResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: { message: '请求失败' } }));
    throw new Error((errorData as ApiResponse<never>).error?.message ?? '请求失败');
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('无法读取响应流');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data) as { content?: string; error?: string };
          if (parsed.error) {
            return { content: fullContent, error: parsed.error };
          }
          if (parsed.content) {
            fullContent += parsed.content;
            onChunk(parsed.content);
          }
        } catch {
          // 解析失败时记录警告，避免静默丢失内容（仅开发环境）
          if (process.env.NODE_ENV === 'development') {
            console.warn('[stream] SSE 数据解析失败:', data);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { content: fullContent };
}
