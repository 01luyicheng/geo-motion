import { useState, useRef, useCallback } from 'react';

interface UseStreamContentReturn {
  streamContent: string;
  appendChunk: (chunk: string) => void;
  clearStreamContent: () => void;
}

/**
 * 管理 SSE 流式内容状态，使用 requestAnimationFrame 批量合并高频 chunk
 * 避免每个 chunk 都触发 re-render（Issue #7）
 */
export function useStreamContent(): UseStreamContentReturn {
  const [streamContent, setStreamContent] = useState('');
  const pendingChunksRef = useRef<string[]>([]);
  const rafIdRef = useRef<number | null>(null);

  const appendChunk = useCallback((chunk: string) => {
    pendingChunksRef.current.push(chunk);
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        const batched = pendingChunksRef.current.join('');
        pendingChunksRef.current = [];
        rafIdRef.current = null;
        setStreamContent((prev) => prev + batched);
      });
    }
  }, []);

  const clearStreamContent = useCallback(() => {
    setStreamContent('');
    pendingChunksRef.current = [];
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  return { streamContent, appendChunk, clearStreamContent };
}
