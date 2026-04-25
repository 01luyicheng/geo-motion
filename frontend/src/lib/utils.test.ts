import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cn,
  generateId,
  formatFileSize,
  fileToBase64,
  getStoredResult,
  setStoredResult,
  truncate,
} from './utils';

describe('cn', () => {
  it('合并 tailwind 类名', () => {
    expect(cn('px-2', 'py-4')).toBe('px-2 py-4');
  });

  it('处理条件类名', () => {
    expect(cn('px-2', false && 'py-4', 'bg-red-500')).toBe('px-2 bg-red-500');
  });

  it('合并冲突类名（tailwind-merge）', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});

describe('generateId', () => {
  it('生成非空字符串', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('每次生成不同 ID', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });
});

describe('formatFileSize', () => {
  it('格式化字节', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('格式化 KB', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('格式化 MB', () => {
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});

describe('fileToBase64', () => {
  it('将 File 转为 base64 Data URI', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const file = new File([blob], 'test.txt', { type: 'text/plain' });
    const result = await fileToBase64(file);
    expect(result.startsWith('data:text/plain;base64,')).toBe(true);
  });
});

describe('getStoredResult', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('返回 null 当 key 不存在', () => {
    expect(getStoredResult('nonexistent')).toBeNull();
  });

  it('正确解析并返回存储值', () => {
    const data = { foo: 'bar', num: 42 };
    localStorage.setItem('myKey', JSON.stringify(data));
    expect(getStoredResult('myKey')).toEqual(data);
  });

  it('解析失败时返回 null', () => {
    localStorage.setItem('badKey', 'not-json{{');
    expect(getStoredResult('badKey')).toBeNull();
  });
});

describe('setStoredResult', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('将值序列化并存储', () => {
    const data = { result: 'ok' };
    setStoredResult('resKey', data);
    expect(localStorage.getItem('resKey')).toBe(JSON.stringify(data));
  });

  it('存储满时静默失败', () => {
    const storeSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    // 不应抛出异常
    expect(() => setStoredResult('key', { value: 1 })).not.toThrow();

    storeSpy.mockRestore();
  });
});

describe('truncate', () => {
  it('不截断短字符串', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('截断长字符串并添加省略号', () => {
    expect(truncate('hello world', 5)).toBe('hello...');
  });
});
