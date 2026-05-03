import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GET } from './route';
import { POST as saveResultPost } from '../../save-result/route';
import { resetStore } from '@/app/api/lib/resultStore';

async function createTestResult(result: {
  id: string;
  geogebra: string;
  conditions: string[];
  goal: string;
  solution: unknown[];
  createdAt: string;
}): Promise<string> {
  const req = new Request('http://localhost/api/save-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ result }),
  }) as unknown as import('next/server').NextRequest;

  const res = await saveResultPost(req);
  const body = await res.json();
  if (!body.success) {
    throw new Error(`Failed to create test result: ${JSON.stringify(body.error)}`);
  }
  return body.data.id as string;
}

describe('GET /api/result/[id]', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    resetStore();
  });

  it('返回存在的分析结果', async () => {
    const result = {
      id: 'internal-id',
      geogebra: 'A=(1,1)',
      conditions: ['c1'],
      goal: 'goal',
      solution: [],
      createdAt: new Date().toISOString(),
    };

    const id = await createTestResult(result);

    const req = new Request(`http://localhost/api/result/${id}`) as unknown as import('next/server').NextRequest;
    const res = await GET(req, { params: Promise.resolve({ id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(result);
  });

  it('不存在的结果返回 404', async () => {
    const id = 'non-existent-id';
    const req = new Request(`http://localhost/api/result/${id}`) as unknown as import('next/server').NextRequest;
    const res = await GET(req, { params: Promise.resolve({ id }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('过期的结果返回 404 并删除', async () => {
    const id = 'expired-id';
    const result = {
      id: 'internal-id',
      geogebra: 'A=(1,1)',
      conditions: ['c1'],
      goal: 'goal',
      solution: [],
      createdAt: new Date().toISOString(),
    };

    // 直接通过存储设置过期数据（仅用于测试过期场景）
    const { getResultStore, createStoredEntry } = await import('@/app/api/lib/resultStore');
    const store = getResultStore();
    const entry = createStoredEntry(result);
    entry.expiresAt = Date.now() - 1000; // 已过期
    store.set(id, entry);

    const req = new Request(`http://localhost/api/result/${id}`) as unknown as import('next/server').NextRequest;
    const res = await GET(req, { params: Promise.resolve({ id }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('EXPIRED');
    expect(store.has(id)).toBe(false);
  });
});
