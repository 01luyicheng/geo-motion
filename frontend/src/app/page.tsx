'use client';

import { useState, useCallback, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ScanSearch,
  Pencil,
  ArrowRight,
  Loader2,
  AlertCircle,
  X,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { ImageUploader } from '@/components/ImageUploader';
import { GeoGebraViewer } from '@/components/GeoGebraViewer';
import { cn, generateId, setStoredResult } from '@/lib/utils';
import { parseVlmJson } from '@/lib/openrouter';
import { vlmOutputSchema } from '@/lib/validation';
import { streamRequest } from '@/lib/stream';
import { useStreamContent } from '@/hooks/useStreamContent';
import { useRealtimeGeoGebra } from '@/hooks/useRealtimeGeoGebra';
import type { AnalysisResult, UploadMode } from '@/types';

function normalizeSolution(
  solution: Array<string | { text: string; commandIndices: number[]; explanation?: string }> | undefined
): AnalysisResult['solution'] {
  if (!solution || solution.length === 0) return [];
  if (solution.every((item) => typeof item === 'string')) {
    return solution as string[];
  }
  return solution.map((item) => {
    if (typeof item === 'string') return item;
    return {
      text: item.text,
      commandIndices: item.commandIndices,
      explanation: item.explanation,
    };
  }).map((item) => {
    if (typeof item === 'string') {
      return {
        text: item,
        commandIndices: [],
      };
    }
    return item;
  });
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
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const { streamContent, appendChunk, clearStreamContent } = useStreamContent();
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // 实时 GeoGebra 渲染
  const { commands, processStreamContent, reset: resetRealtimeGeoGebra, getCommandsString } = useRealtimeGeoGebra();
  const [showRealtimePreview, setShowRealtimePreview] = useState(false);
  
  // 语法错误检查和重试状态
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  const abortCurrentRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const handleCancelRequest = useCallback(() => {
    abortCurrentRequest();
  }, [abortCurrentRequest]);

  useEffect(() => {
    return () => {
      abortCurrentRequest();
    };
  }, [abortCurrentRequest]);
  
  // 实时处理流式内容
  useEffect(() => {
    if (streamContent && loading) {
      processStreamContent(streamContent);
    }
  }, [streamContent, loading, processStreamContent]);

  // 验证 GeoGebra 命令语法
  const validateGeoGebraCommands = useCallback((commands: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const lines = commands.split('\n').filter(line => line.trim());
    
    // 基本语法检查
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      // 检查空括号
      if (trimmed.match(/\(\s*\)/)) {
        errors.push(`第 ${index + 1} 行: 空括号`);
      }
      
      // 检查未闭合的括号
      const openParens = (trimmed.match(/\(/g) || []).length;
      const closeParens = (trimmed.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        errors.push(`第 ${index + 1} 行: 括号不匹配`);
      }
      
      // 检查无效字符
      if (trimmed.match(/[\u4e00-\u9fa5]/)) {
        errors.push(`第 ${index + 1} 行: 包含中文字符`);
      }
      
      // 检查命令格式 (基本命令应该以字母开头)
      if (!trimmed.match(/^[\p{L}_]/u)) {
        errors.push(`第 ${index + 1} 行: 命令格式错误`);
      }
    });
    
    return { valid: errors.length === 0, errors };
  }, []);

  // 处理分析请求，包含语法验证和重试
  const handleAnalyze = useCallback(async () => {
    if (!image) return;
    abortCurrentRequest();

    const currentController = new AbortController();
    abortControllerRef.current = currentController;

    setLoading(true);
    setError(null);
    setCancelNotice(null);
    setValidationError(null);
    clearStreamContent();
    resetRealtimeGeoGebra();
    setShowRealtimePreview(true);
    setRetryCount(0);

    let currentRetry = 0;
    let latestValidationError = validationError ?? '';
    try {
      while (currentRetry <= MAX_RETRIES) {
        try {
          const result = await streamRequest(
            '/api/analyze',
            { image, retryCount: currentRetry, previousError: latestValidationError || undefined, timestamp: Date.now() },
            appendChunk,
            { signal: currentController.signal }
          );

          if (result.error) {
            throw new Error(result.error);
          }

          let parsed: ReturnType<typeof parseVlmJson<typeof vlmOutputSchema>>;
          try {
            parsed = parseVlmJson(result.content, vlmOutputSchema);
          } catch {
            console.error('[analyze] JSON 解析失败，原始内容:', result.content);
            throw new Error('AI 返回格式错误，请重试');
          }

          if (!parsed.geogebra || !parsed.conditions || !parsed.goal) {
            throw new Error('未能从图片中识别几何图形');
          }

          // 语法验证
          setIsValidating(true);
          const validation = validateGeoGebraCommands(parsed.geogebra);
          setIsValidating(false);

          if (!validation.valid && currentRetry < MAX_RETRIES) {
            // 有语法错误，需要重试
            const errorText = validation.errors.join('; ');
            latestValidationError = errorText;
            setValidationError(errorText);
            setRetryCount(currentRetry + 1);
            currentRetry++;
            clearStreamContent();
            continue; // 继续循环重试
          }

          if (!validation.valid && currentRetry >= MAX_RETRIES) {
            // 达到最大重试次数，显示错误但不跳转
            setValidationError(`语法错误 (已达到最大重试次数): ${validation.errors.join('; ')}`);
            setLoading(false);
            return;
          }

          // 验证通过，保存并跳转
          const analysisResult: AnalysisResult = {
            id: `analysis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            geogebra: parsed.geogebra,
            conditions: parsed.conditions,
            goal: parsed.goal,
            solution: normalizeSolution(parsed.solution),
            createdAt: new Date().toISOString(),
          };

          const id = generateId();
          setStoredResult(`analysis:${id}`, analysisResult);

          // 异步保存到服务端，使分享链接可跨设备使用
          try {
            const saveRes = await fetch('/api/save-result', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ result: analysisResult }),
            });
            if (saveRes.ok) {
              const saveData = (await saveRes.json()) as { success: boolean; data?: { id: string } };
              if (saveData.success && saveData.data?.id) {
                router.push(`/analyze/${saveData.data.id}?type=analyze`);
                return;
              }
            }
          } catch {
            // 服务端保存失败时，fallback 到本地 ID
            console.warn('[page] 服务端保存失败，使用本地 ID');
          }

          router.push(`/analyze/${id}?type=analyze`);
          return; // 成功，退出函数

        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            if (abortControllerRef.current !== currentController) {
              return;
            }
            setCancelNotice('已取消本次请求，你可以调整输入后重新开始。');
            setLoading(false);
            setShowRealtimePreview(false);
            return;
          }

          if (currentRetry >= MAX_RETRIES) {
            setError(err instanceof Error ? err.message : '未知错误');
            setLoading(false);
            return;
          }
          currentRetry++;
          setRetryCount(currentRetry);
        }
      }
    } finally {
      if (abortControllerRef.current === currentController) {
        abortControllerRef.current = null;
      }
    }

    if (abortControllerRef.current === null) {
      setLoading(false);
    }
  }, [image, abortCurrentRequest, router, validateGeoGebraCommands, validationError, clearStreamContent, resetRealtimeGeoGebra, appendChunk]);

  // 处理生成请求，包含语法验证和重试
  const handleGenerate = useCallback(async () => {
    if (!text.trim()) return;
    abortCurrentRequest();

    const currentController = new AbortController();
    abortControllerRef.current = currentController;

    setLoading(true);
    setError(null);
    setCancelNotice(null);
    setValidationError(null);
    clearStreamContent();
    resetRealtimeGeoGebra();
    setShowRealtimePreview(true);
    setRetryCount(0);

    let currentRetry = 0;
    let latestValidationError = validationError ?? '';
    try {
      while (currentRetry <= MAX_RETRIES) {
        try {
          const result = await streamRequest(
            '/api/generate-graphic',
            { text, sketch: sketch ?? undefined, retryCount: currentRetry, previousError: latestValidationError || undefined, timestamp: Date.now() },
            appendChunk,
            { signal: currentController.signal }
          );

          if (result.error) {
            throw new Error(result.error);
          }

          let parsed: ReturnType<typeof parseVlmJson<typeof vlmOutputSchema>>;
          try {
            parsed = parseVlmJson(result.content, vlmOutputSchema);
          } catch {
            console.error('[generate-graphic] JSON 解析失败，原始内容:', result.content);
            throw new Error('AI 返回格式错误，请重试');
          }

          if (!parsed.geogebra) {
            throw new Error('图形生成失败，请检查题目描述');
          }

          // 语法验证
          setIsValidating(true);
          const validation = validateGeoGebraCommands(parsed.geogebra);
          setIsValidating(false);

          if (!validation.valid && currentRetry < MAX_RETRIES) {
            // 有语法错误，需要重试
            const errorText = validation.errors.join('; ');
            latestValidationError = errorText;
            setValidationError(errorText);
            setRetryCount(currentRetry + 1);
            currentRetry++;
            clearStreamContent();
            continue; // 继续循环重试
          }

          if (!validation.valid && currentRetry >= MAX_RETRIES) {
            // 达到最大重试次数，显示错误但不跳转
            setValidationError(`语法错误 (已达到最大重试次数): ${validation.errors.join('; ')}`);
            setLoading(false);
            return;
          }

          // 验证通过，保存并跳转
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

          // 异步保存到服务端，使分享链接可跨设备使用
          try {
            const saveRes = await fetch('/api/save-result', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ result: graphicResult }),
            });
            if (saveRes.ok) {
              const saveData = (await saveRes.json()) as { success: boolean; data?: { id: string } };
              if (saveData.success && saveData.data?.id) {
                router.push(`/analyze/${saveData.data.id}?type=generate`);
                return;
              }
            }
          } catch {
            // 服务端保存失败时，fallback 到本地 ID
            console.warn('[page] 服务端保存失败，使用本地 ID');
          }

          router.push(`/analyze/${id}?type=generate`);
          return; // 成功，退出函数

        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            if (abortControllerRef.current !== currentController) {
              return;
            }
            setCancelNotice('已取消本次请求，你可以调整输入后重新开始。');
            setLoading(false);
            setShowRealtimePreview(false);
            return;
          }

          if (currentRetry >= MAX_RETRIES) {
            setError(err instanceof Error ? err.message : '未知错误');
            setLoading(false);
            return;
          }
          currentRetry++;
          setRetryCount(currentRetry);
        }
      }
    } finally {
      if (abortControllerRef.current === currentController) {
        abortControllerRef.current = null;
      }
    }

    if (abortControllerRef.current === null) {
      setLoading(false);
    }
  }, [text, sketch, abortCurrentRequest, router, validateGeoGebraCommands, validationError, clearStreamContent, resetRealtimeGeoGebra, appendChunk]);

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
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Hero - 精致极简主义风格 */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/10 bg-card p-10 shadow-sm">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-primary/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-primary/5 to-transparent rounded-full blur-3xl" />
        <div className="relative text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary mb-6">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary"></span>
            AI 驱动的几何图形生成工具
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-foreground">
            GeoMotion
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            将几何题转化为可交互演示图形，让教学更生动
          </p>
        </div>
      </div>

      {/* 模式切换 - 简洁卡片风格 */}
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => {
            setMode('analyze');
            setError(null);
            setCancelNotice(null);
            clearStreamContent();
          }}
          className={cn(
            'group relative flex flex-col items-center gap-4 rounded-2xl border p-6 transition-all duration-150',
            mode === 'analyze'
              ? 'border-primary/30 bg-primary/[0.03]'
              : 'border-border bg-card hover:border-primary/20 hover:bg-primary/[0.02]'
          )}
        >
          <div className={cn(
            'flex h-12 w-12 items-center justify-center rounded-xl transition-colors duration-150',
            mode === 'analyze' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:bg-primary/10'
          )}>
            <ScanSearch className="h-6 w-6" />
          </div>
          <div className="text-center">
            <p className={cn('text-sm font-semibold', mode === 'analyze' ? 'text-primary' : 'text-foreground')}>
              分析几何题
            </p>
            <p className="mt-1 text-xs text-muted-foreground">上传图片自动识别</p>
          </div>
          {mode === 'analyze' && (
            <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-primary" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('generate');
            setError(null);
            setCancelNotice(null);
            clearStreamContent();
          }}
          className={cn(
            'group relative flex flex-col items-center gap-4 rounded-2xl border p-6 transition-all duration-150',
            mode === 'generate'
              ? 'border-primary/30 bg-primary/[0.03]'
              : 'border-border bg-card hover:border-primary/20 hover:bg-primary/[0.02]'
          )}
        >
          <div className={cn(
            'flex h-12 w-12 items-center justify-center rounded-xl transition-colors duration-150',
            mode === 'generate' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:bg-primary/10'
          )}>
            <Pencil className="h-6 w-6" />
          </div>
          <div className="text-center">
            <p className={cn('text-sm font-semibold', mode === 'generate' ? 'text-primary' : 'text-foreground')}>
              草图转精确图
            </p>
            <p className="mt-1 text-xs text-muted-foreground">文字描述生成</p>
          </div>
          {mode === 'generate' && (
            <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-primary" />
          )}
        </button>
      </div>

      {/* 卡片内容 - 简洁布局 */}
      <div className="rounded-2xl border border-border bg-card p-8 space-y-6">
        {mode === 'analyze' ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <ScanSearch className="h-5 w-5 text-primary" />
                  上传几何题图片
                </h2>
                <p className="text-sm text-muted-foreground">
                  拍照或上传题目图片，AI 自动识别图形并生成可交互 GeoGebra 演示
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5">
                <span className="text-xs font-medium text-primary">推荐</span>
                <span className="text-[10px] text-muted-foreground">支持 JPG/PNG</span>
              </div>
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
              className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 font-semibold text-primary-foreground shadow-sm transition-all hover:shadow-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> AI 分析中…</>
              ) : (
                <><ScanSearch className="h-5 w-5" /> 开始分析 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
              )}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Pencil className="h-5 w-5 text-primary" />
                  题目文字 + 草图 → 精确图形
                </h2>
                <p className="text-sm text-muted-foreground">
                  输入题目文字描述，可选附上手绘草图，AI 生成印刷级精确几何图
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5">
                <span className="text-xs font-medium text-primary">智能生成</span>
                <span className="text-[10px] text-muted-foreground">AI 驱动</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">1</div>
                  题目文本 <span className="text-destructive">*</span>
                </label>
                <span className={cn(
                  "text-xs font-medium tabular-nums rounded-full px-2 py-0.5",
                  text.length > 0 ? "bg-primary/10 text-primary" : "text-muted-foreground"
                )}>
                  {text.length > 0 ? `${text.length} 字` : '未输入'}
                </span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={loading}
                rows={4}
                placeholder="例：已知三角形 ABC 中，AB=5cm，BC=6cm，∠B=60°，求边 AC 的长度"
                className="w-full resize-none rounded-xl border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 transition-all"
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
              className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 font-semibold text-primary-foreground shadow-sm transition-all hover:shadow-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> AI 生成中…</>
              ) : (
                <><Pencil className="h-5 w-5" /> 生成精确图形 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
              )}
            </button>
          </>
        )}

        {/* 加载进度显示 */}
        {loading && (
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.02] p-6 space-y-4">
            <div className="space-y-4">
              {/* 状态头部 */}
              <div className="flex items-center gap-3">
                <div className="relative">
                  {isValidating ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20">
                      <span className="text-xs">🔍</span>
                    </div>
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-primary">
                    {isValidating 
                      ? '正在验证命令语法…' 
                      : retryCount > 0 
                        ? `AI 重新生成中 (第 ${retryCount}/${MAX_RETRIES} 次尝试)…`
                        : `AI 正在${mode === 'analyze' ? '智能识别图形' : '生成精确几何图形'}…`
                    }
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isValidating 
                      ? '检查 GeoGebra 命令语法是否正确'
                      : retryCount > 0
                        ? '检测到语法错误，正在要求 AI 修正'
                        : mode === 'analyze' 
                          ? '正在分析图片中的几何元素和条件' 
                          : '正在理解题目并生成 GeoGebra 命令'
                    }
                  </p>
                </div>
              </div>
              
              {/* 重试警告 */}
              {retryCount > 0 && validationError && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-xs">⚠️</div>
                    <p className="text-xs font-medium text-amber-700">检测到语法错误</p>
                  </div>
                  <p className="text-xs text-amber-600 bg-amber-500/10 rounded-lg p-2 font-mono">
                    {validationError}
                  </p>
                </div>
              )}
              
              {/* 进度条 */}
              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/10">
                  <div className="h-full rounded-full bg-primary" style={{width: '60%'}} />
                </div>
                {streamContent.length > 0 && (
                  <span className="shrink-0 text-xs font-medium tabular-nums text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {streamContent.length} 字符
                  </span>
                )}
              </div>

              {/* AI 输出预览 - 默认展开 */}
              {streamContent.length > 0 && (
                <div className="rounded-xl border bg-background/50 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
                    <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <span className="inline-flex h-2 w-2 rounded-full bg-primary"></span>
                      AI 实时输出
                    </span>
                    <span className="text-[10px] text-muted-foreground">实时更新中</span>
                  </div>
                  <div className="bg-muted/30">
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all p-3 text-[10px] leading-relaxed text-muted-foreground font-mono">
                      {streamContent}
                      <span className="animate-pulse text-primary">▊</span>
                    </pre>
                  </div>
                </div>
              )}
              
              {/* 实时 GeoGebra 预览 */}
              {showRealtimePreview && commands.length > 0 && (
                <div className="rounded-xl border border-primary/20 bg-card overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-primary/[0.03] border-b border-primary/10">
                    <span className="flex items-center gap-2 text-xs font-medium text-primary">
                      <Layers className="h-4 w-4" />
                      实时图形预览
                    </span>
                    <span className="text-[10px] text-primary/70">
                      {commands.length} 条命令
                    </span>
                  </div>
                  <div className="p-4">
                    <GeoGebraViewer
                      commands={getCommandsString()}
                      height={350}
                      showToolbar={false}
                      onCommandError={(result) => {
                        console.log('[Realtime Preview] 命令错误:', result);
                      }}
                    />
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-[10px]">💡</span>
                </div>
                <span>
                  {retryCount > 0 
                    ? '正在修复语法错误，请稍候…' 
                    : 'AI 响应可能需要 10–30 秒，请耐心等候…'
                  }
                </span>
              </div>

              <button
                type="button"
                onClick={handleCancelRequest}
                className="w-full rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                取消本次请求
              </button>
            </div>
          </div>
        )}

        {cancelNotice && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{cancelNotice}</span>
            <button
              type="button"
              onClick={() => setCancelNotice(null)}
              className="ml-1 shrink-0 rounded-md p-1 hover:bg-amber-500/20 transition-colors"
              aria-label="关闭提示"
            >
              <X className="h-3.5 w-3.5" />
            </button>
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

      {/* 功能特性 - 简洁网格布局 */}
      <div className="grid grid-cols-2 gap-3">
        {[
          {
            icon: '📸',
            title: '拍照上传',
            desc: 'AI 自动解析几何图形',
          },
          {
            icon: '🎬',
            title: '动画演示',
            desc: '逐步播放作图过程',
          },
          {
            icon: '🖱️',
            title: '交互操作',
            desc: '拖动顶点自主探究',
          },
          {
            icon: '🖨️',
            title: '印刷导出',
            desc: '精确图形嵌入试卷',
          },
        ].map((item) => (
          <div
            key={item.title}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/20 hover:bg-primary/[0.02]"
          >
            <span className="text-xl">{item.icon}</span>
            <div>
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 快捷键提示 */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-muted text-[10px] font-medium">⌘</span>
        <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-muted text-[10px] font-medium">↵</span>
        <span>快速提交</span>
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