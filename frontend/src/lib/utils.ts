import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind 类名合并工具 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 生成简单的 UUID v4 */
export function generateId(): string {
  return crypto.randomUUID();
}

/** 格式化文件大小 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 图片文件转 Base64 Data URI */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 从 localStorage 读取分析结果 */
export function getStoredResult<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 存储结果到 localStorage（含容量溢出保护，Issue #18） */
export function setStoredResult<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // QuotaExceededError：存储已满，静默失败并记录警告（仅开发环境）
    if (process.env.NODE_ENV === 'development') {
      console.warn('[utils] localStorage 写入失败（存储空间不足）:', key, err);
    }
  }
}

/** 截断长字符串 */
export function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? `${str.slice(0, maxLen)}...` : str;
}
