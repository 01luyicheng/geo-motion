'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ScanSearch,
  Pencil,
  ArrowRight,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import { ImageUploader } from '@/components/ImageUploader';
import { cn, generateId, setStoredResult } from '@/lib/utils';
import { parseVlmJson } from '@/lib/openrouter';
import { streamRequest } from '@/lib/stream';
import { useStreamContent } from '@/hooks/useStreamContent';
import type { AnalysisResult, UploadMode } from '@/types';

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
  const { streamContent, appendChunk, clearStreamContent } = useStreamContent();

  const handleAnalyze = useCallback(async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    clearStreamContent();

    try {
      const result = await streamRequest(
        '/api/analyze',
        { image },
        appendChunk
      );

      if (result.error) {
        throw new Error(result.error);
      }

      let parsed: {
        geogebra: string;
        conditions: string[];
        goal: string;
        solution: string[];
      };
      try {
        parsed = parseVlmJson(result.content);
      } catch {
        console.error('[analyze] JSON 解析失败，原始内容:', result.content);
        throw new Error('AI 返回格式错误，请重试');
      }

      if (!parsed.geogebra || !parsed.conditions || !parsed.goal) {
        throw new Error('未能从图片中识别几何图形');
      }

      const analysisResult: AnalysisResult = {
        id: `analysis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        geogebra: parsed.geogebra,
        conditions: parsed.conditions,
        goal: parsed.goal,
        solution: parsed.solution ?? [],
        createdAt: new Date().toISOString(),
      };

      const id = generateId();
      setStoredResult(`analysis:${id}`, analysisResult);
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
    clearStreamContent();

    try {
      const result = await streamRequest(
        '/api/generate-graphic',
        { text, sketch: sketch ?? undefined },
        appendChunk
      );

      if (result.error) {
        throw new Error(result.error);
      }

      let parsed: {
        geogebra: string;
        conditions: string[];
        goal: string;
      };
      try {
        parsed = parseVlmJson(result.content);
      } catch {
        console.error('[generate-graphic] JSON 解析失败，原始内容:', result.content);
        throw new Error('AI 返回格式错误，请重试');
      }

      if (!parsed.geogebra) {
        throw new Error('图形生成失败，请检查题目描述');
      }

      const graphicResult: AnalysisResult = {
        id: `graphic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        geogebra: parsed.geogebra,
        conditions: parsed.conditions ?? [],
        goal: parsed.goal ?? '',
        solution: [],
        createdAt: new Date().toISOString(),
      };

      const id = generateId();
      setStoredResult(`analysis:${id}`, graphicResult);
      router.push(`/analyze/${id}?type=generate`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, [text, sketch, router]);

  // 键盘快捷键：Ctrl/Cmd + Enter 提交
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (mode === 'analyze' && image && !loading) void handleAnalyze();
        if (mode === 'generate' && text.trim() && !loading) void handleGenerate();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mode, image, text, loading, handleAnalyze, handleGenerate]);

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
          onClick={() => { setMode('analyze'); setError(null); clearStreamContent(); }}
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
          onClick={() => { setMode('generate'); setError(null); clearStreamContent(); }}
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
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium">题目文本 <span className="text-destructive">*</span></label>
                <span className="text-xs text-muted-foreground">{text.length > 0 ? `${text.length} 字` : ''}</span>
              </div>
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

        {/* 加载进度显示 */}
        {loading && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium text-primary">
                AI 正在{mode === 'analyze' ? '识别图形并生成命令' : '生成几何图形'}…
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/20">
                <div className="h-full animate-progress-indeterminate rounded-full bg-primary" />
              </div>
              {streamContent.length > 0 && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  已接收 {streamContent.length} 字符
                </span>
              )}
            </div>
            {/* AI 输出预览 */}
            {streamContent.length > 0 && (
              <div className="mt-2 rounded border bg-background/80 p-2">
                <p className="mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">AI 输出预览</p>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-muted-foreground font-mono">
                  {streamContent.slice(-500)}
                  <span className="animate-pulse">▊</span>
                </pre>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              AI 响应可能需要 10–30 秒，请耐心等候…
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-1 shrink-0 rounded-md p-1 hover:bg-destructive/20 transition-colors"
              aria-label="关闭错误"
            >
              <X className="h-3.5 w-3.5" />
            </button>
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
            className="flex items-start gap-3 rounded-xl border bg-card px-5 py-4 shadow-sm"
          >
            <span className="text-2xl">{item.icon}</span>
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 快捷键提示 */}
      <p className="text-center text-xs text-muted-foreground">
        提示：按 <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Ctrl</kbd> + <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd> 快速提交
      </p>
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