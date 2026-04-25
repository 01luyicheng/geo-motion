import type { AnalysisResult } from '@/types';

// 7 天过期时间（毫秒）
const EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;

// 最大存储容量
const MAX_CAPACITY = 1000;

interface StoredEntry {
  result: AnalysisResult;
  expiresAt: number;
}

export interface IResultStore {
  get(id: string): StoredEntry | undefined;
  set(id: string, entry: StoredEntry): void;
  delete(id: string): boolean;
  has(id: string): boolean;
  clear(): void;
  get size(): number;
  entries(): IterableIterator<[string, StoredEntry]>;
}

// 内存存储实现（带容量限制）
class MemoryResultStore implements IResultStore {
  private store = new Map<string, StoredEntry>();

  get(id: string): StoredEntry | undefined {
    return this.store.get(id);
  }

  set(id: string, entry: StoredEntry): void {
    // 防御性容量检查
    if (!this.store.has(id) && this.store.size >= MAX_CAPACITY) {
      throw new Error('Storage capacity exceeded');
    }
    this.store.set(id, entry);
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  entries(): IterableIterator<[string, StoredEntry]> {
    return this.store.entries();
  }
}

// 单例存储实例
const memoryStore = new MemoryResultStore();

// GET 访问计数器（用于触发惰性全量清理）
let getAccessCount = 0;
const FULL_CLEAN_INTERVAL = 100;

/**
 * 惰性清理过期数据
 * 在 GET 访问时检查并清理过期条目，每 FULL_CLEAN_INTERVAL 次触发一次全量清理
 */
export function lazyCleanup(store: IResultStore): number {
  getAccessCount++;
  const now = Date.now();
  let cleaned = 0;

  if (getAccessCount % FULL_CLEAN_INTERVAL === 0) {
    // 全量清理
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt < now) {
        store.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[resultStore] 全量清理 ${cleaned} 条过期数据，剩余 ${store.size} 条`);
    }
  }

  return cleaned;
}

// 检测是否在 Vercel Serverless 环境
function isVercelServerless(): boolean {
  return !!(
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.VERCEL_URL
  );
}

// 检查容量限制
function isAtCapacity(): boolean {
  return memoryStore.size >= MAX_CAPACITY;
}

// 创建存储条目
export function createStoredEntry(result: AnalysisResult): StoredEntry {
  return {
    result,
    expiresAt: Date.now() + EXPIRE_MS,
  };
}

// 获取存储实例（检测环境）
export function getResultStore(): IResultStore {
  return memoryStore;
}

// 检查是否支持持久化存储
export function isPersistentStorageAvailable(): boolean {
  return !isVercelServerless();
}

// 获取存储不可用时的错误响应
export function getStorageUnavailableResponse(): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code: 'STORAGE_UNAVAILABLE',
        message: '分享功能需要持久化存储',
      },
    }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}

// 获取容量超限时的错误响应
export function getCapacityExceededResponse(): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code: 'CAPACITY_EXCEEDED',
        message: '存储容量已满，请稍后重试',
      },
    }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}

// 检查并返回存储状态
export function checkStoreAvailability(): { available: boolean; response?: Response } {
  if (isVercelServerless()) {
    return { available: false, response: getStorageUnavailableResponse() };
  }
  if (isAtCapacity()) {
    return { available: false, response: getCapacityExceededResponse() };
  }
  return { available: true };
}

export { memoryStore, EXPIRE_MS, MAX_CAPACITY };
export type { StoredEntry };
