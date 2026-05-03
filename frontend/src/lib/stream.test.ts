import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamRequest } from './stream';

// 辅助：创建模拟的 ReadableStream
function createMockStream(chunks: Uint8Array[]) {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.close();
      }
    },
  });
}

function encodeString(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

describe('streamRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ── 1. SSE 解析 ────────────────────────────────────────────

  describe('SSE 解析', () => {
    it('正常解析并逐块回调', async () => {
      const chunks = [
        encodeString('data: {"content":"Hello"}\n\n'),
        encodeString('data: {"content":" World"}\n\n'),
      ];
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: createMockStream(chunks),
        json: vi.fn(),
      } as unknown as Response);

      const onChunk = vi.fn();
      const result = await streamRequest('https://api.example.com/stream', { prompt: 'hi' }, onChunk);

      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(onChunk).toHaveBeenNthCalledWith(1, 'Hello');
      expect(onChunk).toHaveBeenNthCalledWith(2, ' World');
      expect(result.content).toBe('Hello World');
      expect(result.error).toBeUndefined();
    });

    it('处理跨多个 chunk 的不完整行', async () => {
      const chunks = [
        encodeString('data: {"content":"Hel'),
        encodeString('lo"}\n\ndata: {"content":" World"}\n\n'),
      ];
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: createMockStream(chunks),
        json: vi.fn(),
      } as unknown as Response);

      const onChunk = vi.fn();
      const result = await streamRequest('https://api.example.com/stream', {}, onChunk);

      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(result.content).toBe('Hello World');
    });

    it('忽略 [DONE] 标记', async () => {
      const chunks = [
        encodeString('data: {"content":"Hi"}\n\ndata: [DONE]\n\n'),
      ];
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: createMockStream(chunks),
        json: vi.fn(),
      } as unknown as Response);

      const onChunk = vi.fn();
      const result = await streamRequest('https://api.example.com/stream', {}, onChunk);

      expect(onChunk).toHaveBeenCalledTimes(1);
      expect(result.content).toBe('Hi');
    });

    it('忽略空行和不含 data: 前缀的行', async () => {
      const chunks = [
        encodeString('\nevent: message\n\ndata: {"content":"A"}\n\n:comment\n\n'),
      ];
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: createMockStream(chunks),
        json: vi.fn(),
      } as unknown as Response);

      const onChunk = vi.fn();
      const result = await streamRequest('https://api.example.com/stream', {}, onChunk);

      expect(onChunk).toHaveBeenCalledTimes(1);
      expect(result.content).toBe('A');
    });

    it('处理不含 content 字段的数据', async () => {
      const chunks = [
        encodeString('data: {"role":"assistant"}\n\n'),
      ];
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: createMockStream(chunks),
        json: vi.fn(),
      } as unknown as Response);

      const onChunk = vi.fn();
      const result = await streamRequest('https://api.example.com/stream', {}, onChunk);

      expect(onChunk).not.toHaveBeenCalled();
      expect(result.content).toBe('');
    });

    it('处理多个 content 块连续发送', async () => {
      const chunks = [
        encodeString(
          'data: {"content":"1"}\n\ndata: {"content":"2"}\n\ndata: {"content":"3"}\n\n'
        ),
      ];
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: createMockStream(chunks),
        json: vi.fn(),
      } as unknown as Response);

      const onChunk = vi.fn();
      const result = await streamRequest('https://api.example.com/stream', {}, onChunk);

      expect(onChunk).toHaveBeenCalledTimes(3);
      expect(result.content).toBe('123');
    });
  });

  // ── 2. 错误处理 ────────────────────────────────────────────

  describe('错误处理', () => {
    it('HTTP 错误时抛出异常并解析错误消息', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValueOnce({
          success: false,
          error: { code: 'BAD_REQUEST', message: '参数错误' },
        }),
      } as unknown as Response);

      await expect(
        streamRequest('https://api.example.com/stream', {}, vi.fn())
      ).rejects.toThrow('参数错误');
    });

    it('HTTP 错误时 json 解析失败使用默认消息', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValueOnce(new Error('bad json')),
      } as unknown as Response);

      await expect(
        streamRequest('https://api.example.com/stream', {}, vi.fn())
      ).rejects.toThrow('请求失败');
    });

    it('响应体为空时抛出异常', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: null,
        json: vi.fn(),
      } as unknown as Response);

      await expect(
        streamRequest('https://api.example.com/stream', {}, vi.fn())
      ).rejects.toThrow('无法读取响应流');
    });

    it('SSE 数据中包含 error 字段时返回错误结果', async () => {
      const chunks = [
        encodeString('data: {"content":" partial"}\n\n'),
        encodeString('data: {"error":"something wrong"}\n\n'),
      ];
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: createMockStream(chunks),
        json: vi.fn(),
      } as unknown as Response);

      const onChunk = vi.fn();
      const result = await streamRequest('https://api.example.com/stream', {}, onChunk);

      expect(result.content).toBe(' partial');
      expect(result.error).toBe('something wrong');
      // 收到 error 后不再处理后续 chunk（因为直接 return）
    });

    it('SSE JSON 解析失败时返回错误（开发环境保留警告）', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const chunks = [
        encodeString('data: not-json\n\n'),
        encodeString('data: {"content":"ok"}\n\n'),
      ];
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: createMockStream(chunks),
        json: vi.fn(),
      } as unknown as Response);

      const onChunk = vi.fn();
      const result = await streamRequest('https://api.example.com/stream', {}, onChunk);

      expect(warnSpy).toHaveBeenCalledWith('[stream] SSE 数据解析失败:', 'not-json');
      expect(onChunk).not.toHaveBeenCalled();
      expect(result.content).toBe('');
      expect(result.error).toBe('流式响应解析失败，请重试');

      warnSpy.mockRestore();
    });

    it('SSE JSON 解析失败时返回错误（生产环境不打印警告）', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const chunks = [
        encodeString('data: bad\n\n'),
        encodeString('data: {"content":"ok"}\n\n'),
      ];
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: createMockStream(chunks),
        json: vi.fn(),
      } as unknown as Response);

      const onChunk = vi.fn();
      const result = await streamRequest('https://api.example.com/stream', {}, onChunk);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(result.content).toBe('');
      expect(result.error).toBe('流式响应解析失败，请重试');

      warnSpy.mockRestore();
    });
  });

  // ── 3. AbortController 取消 ────────────────────────────────

  describe('AbortController 取消', () => {
    it('支持通过 signal 取消请求', async () => {
      const mockFetch = vi.mocked(fetch);
      const abortError = new DOMException('Aborted', 'AbortError');
      mockFetch.mockRejectedValueOnce(abortError);

      const controller = new AbortController();
      const promise = streamRequest(
        'https://api.example.com/stream',
        {},
        vi.fn(),
        { signal: controller.signal }
      );
      controller.abort();

      await expect(promise).rejects.toThrow('Aborted');
    });

    it('fetch 接收 signal 选项', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: createMockStream([encodeString('data: {"content":"x"}\n\n')]),
        json: vi.fn(),
      } as unknown as Response);

      const controller = new AbortController();
      await streamRequest(
        'https://api.example.com/stream',
        {},
        vi.fn(),
        { signal: controller.signal }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/stream',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          signal: controller.signal,
        })
      );
    });
  });

  // ── 4. 边界情况 ────────────────────────────────────────────

  describe('边界情况', () => {
    it('请求体被正确 JSON 序列化', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: createMockStream([]),
        json: vi.fn(),
      } as unknown as Response);

      await streamRequest('https://api.example.com/stream', { foo: 'bar' }, vi.fn());

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/stream',
        expect.objectContaining({
          body: JSON.stringify({ foo: 'bar' }),
        })
      );
    });

    it('空流返回空 content', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: createMockStream([]),
        json: vi.fn(),
      } as unknown as Response);

      const result = await streamRequest('https://api.example.com/stream', {}, vi.fn());
      expect(result.content).toBe('');
      expect(result.error).toBeUndefined();
    });

    it('reader releaseLock 被调用', async () => {
      const releaseLock = vi.fn();
      const reader = {
        read: vi.fn().mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock,
      };
      const body = {
        getReader: () => reader,
      };

      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body,
        json: vi.fn(),
      } as unknown as Response);

      await streamRequest('https://api.example.com/stream', {}, vi.fn());
      expect(releaseLock).toHaveBeenCalled();
    });
  });
});
