'use client';

import { useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ScanSearch,
  Pencil,
  ArrowRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { ImageUploader } from '@/components/ImageUploader';
import { cn, generateId, setStoredResult } from '@/lib/utils';
import type { AnalysisResult, GraphicResult, ApiResponse, UploadMode } from '@/types';

// ── 运行时类型验证辅助函数 ──────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function validateAnalysisResult(data: unknown): data is AnalysisResult {
  if (!isObject(data)) return false;
  return (
    isString(data.id) &&
    isString(data.geogebra) &&
    isStringArray(data.conditions) &&
    isString(data.goal) &&
    isStringArray(data.solution) &&
    isString(data.createdAt)
  );
}

function validateGraphicResult(data: unknown): data is GraphicResult {
  if (!isObject(data)) return false;
  const format = data.format;
  return (
    isString(data.id) &&
    isString(data.geogebra) &&
    (format === 'svg' || format === 'png') &&
    (data.content === undefined || isString(data.content)) &&
    isString(data.createdAt)
  );
}

function validateApiResponse<T>(
  json: unknown,
  validateData: (data: unknown) => data is T
): ApiResponse<T> {
  if (!isObject(json)) {
    throw new Error('API 响应格式无效：期望对象');
  }

  // 验证 success 字段
  if (typeof json.success !== 'boolean') {
    throw new Error('API 响应格式无效：缺少 success 字段');
  }

  // 如果 success 为 false，验证 error 结构
  if (!json.success) {
    if (isObject(json.error) && isString(json.error.code) && isString(json.error.message)) {
      return { success: false, error: { code: json.error.code, message: json.error.message } };
    }
    return { success: false, error: { code: 'UNKNOWN', message: '未知错误' } };
  }

  // 如果 success 为 true，验证 data 结构
  if (!validateData(json.data)) {
    throw new Error('API 响应数据结构无效');
  }

  return { success: true, data: json.data };
}

// ── 首页内容（需要 useSearchParams，放入 Suspense）──────────────

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initMode: UploadMode =
    searchParams.get('mode') === 'generate' ? 'generate' : 'analyze';

  const [mode, setMode] = useState<UploadMode>(initMode);
  const [image, setImage] = useState<string | null>(null);
  const [sketch, setSketch] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (!image) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      });
      const rawJson = await res.json();
      const json = validateApiResponse(rawJson, validateAnalysisResult);
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? '分析失败，请重试');
      }
      const id = generateId();
      setStoredResult(`analysis:${id}`, json.data);
      router.push(`/analyze/${id}?type=analyze`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, [image, router]);

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/generate-graphic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sketch: sketch ?? undefined }),
      });
      const rawJson = await res.json();
      const json = validateApiResponse(rawJson, validateGraphicResult);
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? '生成失败，请重试');
      }
      const id = generateId();
      setStoredResult(`analysis:${id}`, {
        id: json.data.id,
        geogebra: json.data.geogebra,
        conditions: [],
        goal: '',
        solution: [],
        createdAt: json.data.createdAt,
      } satisfies AnalysisResult);
      router.push(`/analyze/${id}?type=generate`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, [text, sketch, router]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Hero */}
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          GeoMotion
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          用 AI 将几何题转化为可交互演示图形，让教学更生动
        </p>
      </div>

      {/* 模式切换 */}
      <div className="flex overflow-hidden rounded-xl border bg-card shadow-sm">
        <button
          type="button"
          onClick={() => { setMode('analyze'); setError(null); }}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 px-6 py-4 text-sm font-medium transition-colors',
            mode === 'analyze'
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted text-muted-foreground'
          )}
        >
          <ScanSearch className="h-5 w-5" />
          分析几何题图片
        </button>
        <button
          type="button"
          onClick={() => { setMode('generate'); setError(null); }}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 px-6 py-4 text-sm font-medium transition-colors',
            mode === 'generate'
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted text-muted-foreground'
          )}
        >
          <Pencil className="h-5 w-5" />
          草图→精确图
        </button>
      </div>

      {/* 卡片内容 */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
        {mode === 'analyze' ? (
          <>
            <div>
              <h2 className="text-base font-semibold">上传几何题图片</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                拍照或上传题目图片，AI 自动识别图形并生成可交互 GeoGebra 演示
              </p>
            </div>
            <ImageUploader
              label="题目图片"
              value={image ?? undefined}
              onChange={setImage}
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!image || loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {loading ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> AI 分析中…</>
              ) : (
                <><ScanSearch className="h-5 w-5" /> 开始分析 <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </>
        ) : (
          <>
            <div>
              <h2 className="text-base font-semibold">题目文字 + 草图 → 精确图形</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                输入题目文字描述，可选附上手绘草图，AI 生成印刷级精确几何图
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">题目文本 <span className="text-destructive">*</span></label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={loading}
                rows={4}
                placeholder="例：已知三角形ABC中，AB=5cm，BC=6cm，∠B=60°，求边AC的长度"
                className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
            </div>

            <ImageUploader
              label="手绘草图（可选）"
              hint="上传手绘草图，AI 参考草图生成更精确的几何图形"
              value={sketch ?? undefined}
              onChange={setSketch}
              disabled={loading}
            />

            <button
              type="button"
              onClick={handleGenerate}
              disabled={!text.trim() || loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {loading ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> AI 生成中…</>
              ) : (
                <><Pencil className="h-5 w-5" /> 生成精确图形 <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* 使用说明 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          {
            icon: '📸',
            title: '拍照上传',
            desc: '用手机拍下几何题，上传后 AI 自动解析图形',
          },
          {
            icon: '🎬',
            title: '动画演示',
            desc: '逐步播放 GeoGebra 作图过程，适合课堂讲解',
          },
          {
            icon: '🖱️',
            title: '交互操作',
            desc: '拖动顶点、缩放、测量，学生可自主探究',
          },
          {
            icon: '🖨️',
            title: '印刷导出',
            desc: '草图转精确图，直接嵌入试卷印刷使用',
          },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-xl border bg-card px-5 py-4 flex items-start gap-3 shadow-sm"
          >
            <span className="text-2xl">{item.icon}</span>
            <div>
              <p className="font-medium text-sm">{item.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
