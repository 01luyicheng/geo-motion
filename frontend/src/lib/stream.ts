import type { ApiResponse } from '@/types';

export interface StreamResult {
  content: string;
  error?: string;
}

export interface StreamRequestOptions {
  signal?: AbortSignal;
}

interface ProcessLineResult {
  content: string;
  error?: string;
}

function processLine(
  line: string,
  currentContentParam: string,
  onChunk: (chunk: string) => void
): ProcessLineResult | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('data: ')) {
    return null;
  }

  const data = trimmed.slice(6);
  if (data === '[DONE]') {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (err) {
    // 解析失败时记录日志，但如果数据看起来是不完整的 JSON（以 { 或 [ 开头但没有闭合），保留到后续处理
    if (process.env.NODE_ENV === 'development') {
      console.warn('[stream] SSE 数据解析失败:', data);
    }
    // 如果数据以 { 或 [ 开头，可能是被截断的不完整 JSON，不丢弃而是记录警告
    const trimmedData = data.trim();
    if (trimmedData.startsWith('{') || trimmedData.startsWith('[')) {
      console.warn('[stream] 可能的不完整 JSON 数据:', trimmedData);
    }
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[stream] SSE 数据解析失败: parsed is not an object');
    }
    return null;
  }

  // 如果解析结果是数组，按顺序处理每个元素（支持批量 SSE 响应格式）
  if (Array.isArray(parsed)) {
    let currentContent = currentContentParam;
    for (const item of parsed) {
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        if (typeof obj.error === 'string') {
          return { content: currentContent, error: obj.error };
        }
        if (typeof obj.content === 'string') {
          currentContent += obj.content;
          onChunk(obj.content);
        }
      }
    }
    return { content: currentContent };
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.error === 'string') {
    return { content: currentContentParam, error: obj.error };
  }
  if (typeof obj.content === 'string') {
    const newContent = currentContentParam + obj.content;
    onChunk(obj.content);
    return { content: newContent };
  }

  return null;
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
      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        const readResult = await reader.read();
        done = readResult.done;
        value = readResult.value;
      } catch (readErr) {
        // 处理读取过程中的异常（如网络断开、AbortError 等）
        if (readErr instanceof Error && readErr.name === 'AbortError') {
          throw readErr;
        }
        console.warn('[stream] 读取响应流时出错:', readErr);
        // 先尝试处理 buffer 中已缓冲的完整数据，再抛出错误
        if (buffer) {
          const lines = buffer.split(/\r?\n/);
          // 保留最后一个不完整的行到 buffer（与正常路径保持一致）
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const result = processLine(line, fullContent, onChunk);
            if (result) {
              if (result.error !== undefined) {
                return result as StreamResult;
              }
              fullContent = result.content;
            }
          }
          // 最后尝试处理残留的不完整行
          if (buffer) {
            const result = processLine(buffer, fullContent, onChunk);
            if (result) {
              if (result.error !== undefined) {
                return result as StreamResult;
              }
              fullContent = result.content;
            }
            buffer = '';
          }
        }
        throw new Error('流读取中断: ' + (readErr instanceof Error ? readErr.message : '未知错误'));
      }

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // 支持 \n 和 \r\n 两种换行符
      const lines = buffer.split(/\r?\n/);
      // 保留最后一个不完整的行到 buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const result = processLine(line, fullContent, onChunk);
        if (result) {
          if (result.error !== undefined) {
            return result as StreamResult;
          }
          fullContent = result.content;
        }
      }
    }

    // 处理 buffer 中残留的无换行符数据
    if (buffer) {
      const trimmedBuffer = buffer.trim();
      // 如果残留数据不以 data: 开头，可能是被截断的不完整 SSE 行，记录警告
      if (trimmedBuffer && !trimmedBuffer.startsWith('data: ')) {
        console.warn('[stream] 流结束时 buffer 中包含不完整的 SSE 数据:', trimmedBuffer);
      }
      const result = processLine(buffer, fullContent, onChunk);
      if (result) {
        if (result.error !== undefined) {
          return result as StreamResult;
        }
        fullContent = result.content;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // 忽略 releaseLock 可能的异常（如 reader 已释放）
    }
  }

  return { content: fullContent };
}
