import { describe, it, expect, beforeEach } from 'vitest';
import { GET } from './route';
import { memoryStore } from '../../save-result/route';

describe('GET /api/result/[id]', () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it('返回存在的分析结果', async () => {
    const id = 'test-result-id';
    const result = {
      id: 'internal-id',
      geogebra: 'A=(1,1)',
      conditions: ['c1'],
      goal: 'goal',
      solution: [],
      createdAt: new Date().toISOString(),
    };

    memoryStore.set(id, {
      result,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

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

    memoryStore.set(id, {
      result,
      expiresAt: Date.now() - 1000, // 已过期
    });

    const req = new Request(`http://localhost/api/result/${id}`) as unknown as import('next/server').NextRequest;
    const res = await GET(req, { params: Promise.resolve({ id }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('EXPIRED');
    expect(memoryStore.has(id)).toBe(false);
  });
});
