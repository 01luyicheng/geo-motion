'use client';

import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Copy,
  Check,
  Download,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Layers,
  ListChecks,
  Target,
  BookOpen,
  Share2,
  RefreshCw,
  AlertCircle,
  GraduationCap,
  Lightbulb,
  X,
} from 'lucide-react';
import { GeoGebraViewer, type CommandExecutionResult } from '@/components/GeoGebraViewer';
import { AnimationControls } from '@/components/AnimationControls';
import { getStoredResult, setStoredResult } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useAnimation } from '@/hooks/useAnimation';
import type { AnalysisResult, Step } from '@/types';

// ─────────────────────────────────────────────────────────────────

export default function AnalyzePage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <Suspense>
      <AnalyzeContent id={params.id} />
    </Suspense>
  );
}

function AnalyzeContent({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const type = searchParams.get('type') ?? 'analyze';

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [notFound, setNotFound] = useState(false);

  // 命令面板展开控制
  const [cmdExpanded, setCmdExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  // 解题步骤展开
  const [solutionExpanded, setSolutionExpanded] = useState(true);

  // 学习模式状态
  const [studyMode, setStudyMode] = useState(false);
  const [highlightedStepIndex, setHighlightedStepIndex] = useState<number | null>(null);
  const [highlightedCommandIndex, setHighlightedCommandIndex] = useState<number | null>(null);
  const [selectedStepExplanation, setSelectedStepExplanation] = useState<string | null>(null);

  // 修复相关状态
  const [isFixing, setIsFixing] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixRetryCount, setFixRetryCount] = useState(0);
  const [lastCommandErrors, setLastCommandErrors] = useState<CommandExecutionResult | null>(null);
  const [showFixNotification, setShowFixNotification] = useState(false);
  const [fixSuccess, setFixSuccess] = useState(false);
  // 使用 ref 进行同步检查，避免竞态条件
  const isFixingRef = useRef(false);

  // 加载结果：优先从服务端获取，fallback 到 localStorage
  useEffect(() => {
    let cancelled = false;

    async function loadResult() {
      // 1. 优先从服务端获取
      try {
        const res = await fetch(`/api/result/${id}`);
        if (res.ok) {
          const data = (await res.json()) as {
            success: boolean;
            data?: AnalysisResult;
          };
          if (data.success && data.data) {
            if (!cancelled) {
              setResult(data.data);
              // 同步到 localStorage，提升后续访问速度
              setStoredResult(`analysis:${id}`, data.data);
            }
            return;
          }
        }
      } catch {
        console.warn('[analyze] 服务端获取失败，尝试 localStorage');
      }

      // 2. Fallback 到 localStorage
      const stored = getStoredResult<AnalysisResult>(`analysis:${id}`);
      if (!cancelled) {
        if (stored) {
          setResult(stored);
        } else {
          setNotFound(true);
        }
      }
    }

    void loadResult();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const commandLines = result
    ? result.geogebra.split('\n').filter((l) => l.trim())
    : [];

  // 解析步骤数据（兼容旧数据字符串数组和新数据 Step 数组）
  const parsedSteps: Step[] = result
    ? result.solution.map((s) => {
        if (typeof s === 'string') {
          return { text: s, commandIndices: [] };
        }
        // 运行时验证 Step 结构
        if (
          s &&
          typeof s === 'object' &&
          'text' in s &&
          typeof (s as Record<string, unknown>).text === 'string' &&
          'commandIndices' in s &&
          Array.isArray((s as Record<string, unknown>).commandIndices) &&
          (s as Record<string, unknown>).commandIndices.every((i) => typeof i === 'number')
        ) {
          return s as Step;
        }
        // 不符合 Step 结构时回退到字符串处理
        return { text: String(s), commandIndices: [] };
      })
    : [];

  // 学习模式：根据高亮的命令找到对应的步骤
  const getStepIndicesByCommandIndex = useCallback((cmdIdx: number): number[] => {
    return parsedSteps
      .map((step, idx) => ({ step, idx }))
      .filter(({ step }) => step.commandIndices.includes(cmdIdx))
      .map(({ idx }) => idx);
  }, [parsedSteps]);

  // 学习模式：根据高亮的步骤找到对应的命令
  const getCommandIndicesByStepIndex = useCallback((stepIdx: number): number[] => {
    const indices = parsedSteps[stepIdx]?.commandIndices ?? [];
    return indices.filter((idx) => idx >= 0 && idx < commandLines.length);
  }, [parsedSteps, commandLines]);

  // 点击步骤时高亮对应命令
  const handleStepClick = useCallback((stepIdx: number) => {
    if (!studyMode) return;
    setHighlightedStepIndex(stepIdx);
    const cmdIndices = getCommandIndicesByStepIndex(stepIdx);
    if (cmdIndices.length > 0) {
      setHighlightedCommandIndex(cmdIndices[0]);
    }
  }, [studyMode, getCommandIndicesByStepIndex]);

  // 点击命令时高亮对应步骤
  const handleCommandClick = useCallback((cmdIdx: number) => {
    if (!studyMode) return;
    setHighlightedCommandIndex(cmdIdx);
    const stepIndices = getStepIndicesByCommandIndex(cmdIdx);
    if (stepIndices.length > 0) {
      setHighlightedStepIndex(stepIndices[0]);
    }
  }, [studyMode, getStepIndicesByCommandIndex]);

  // 动画控制（已提取到 useAnimation hook）
  const {
    appletReady,
    setAppletReady,
    animationMode,
    animState,
    cmdIndex,
    animSpeed,
    handlePlay,
    handlePause,
    handleReset,
    handleStep,
    handleSpeedChange,
  } = useAnimation({ commandCount: commandLines.length });

  // 复制命令
  const handleCopy = useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.geogebra);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  // 分享链接
  const handleShare = useCallback(async () => {
    await navigator.clipboard.writeText(window.location.href);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  }, []);

  // 使用 ref 跟踪重试次数，避免闭包中的旧值问题
  const fixRetryCountRef = useRef(0);

  // 处理命令执行错误
  const handleCommandError = useCallback(async (errorResult: CommandExecutionResult) => {
    console.log('[AnalyzePage] 命令执行错误:', errorResult);
    setLastCommandErrors(errorResult);

    // 使用 ref 进行同步检查，避免竞态条件
    // 立即检查并设置 isFixingRef，防止快速连续调用绕过检查
    if (isFixingRef.current || fixRetryCountRef.current >= 3) {
      return;
    }

    // 立即设置 isFixingRef，防止竞态条件
    isFixingRef.current = true;

    // 自动触发修复
    await fixCommands(errorResult);
  }, []);

  // 调用 API 修复命令
  const fixCommands = async (errorResult: CommandExecutionResult) => {
    if (!result) return;

    // 注意：isFixingRef.current 已在 handleCommandError 中设置
    setIsFixing(true);
    setFixError(null);
    setShowFixNotification(true);
    setFixSuccess(false);

    try {
      const response = await fetch('/api/fix-commands', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          originalCommands: result.geogebra,
          errors: errorResult.errors,
          conditions: result.conditions,
          goal: result.goal,
          retryCount: fixRetryCount,
          timestamp: Date.now(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 区分不同类型的错误
        if (response.status === 429) {
          throw new Error('请求过于频繁，请稍后再试');
        }
        if (response.status === 503) {
          throw new Error('服务暂时不可用，请稍后重试');
        }
        if (response.status >= 500) {
          throw new Error('服务器错误，请联系管理员');
        }
        throw new Error(data.error?.message || '修复请求失败');
      }

      if (!data.success) {
        // 区分修复失败的不同原因
        if (data.error?.code === 'UNFIXABLE') {
          throw new Error('命令无法自动修复，请手动修改或重新生成');
        }
        if (data.error?.code === 'INVALID_INPUT') {
          throw new Error('输入数据无效，请检查命令格式');
        }
        throw new Error(data.message || '修复失败');
      }

      // 更新结果
      const updatedResult: AnalysisResult = {
        ...result,
        geogebra: data.geogebra,
      };

      // 保存到本地存储
      setStoredResult(`analysis:${id}`, updatedResult);
      setResult(updatedResult);
      
      // 同步更新 ref 和 state
      fixRetryCountRef.current += 1;
      setFixRetryCount(fixRetryCountRef.current);
      setFixSuccess(true);

      // 修复成功后重置动画状态
      handleReset();

      // 3 秒后隐藏成功提示
      setTimeout(() => {
        setShowFixNotification(false);
      }, 3000);

      console.log('[AnalyzePage] 命令修复成功:', data.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : '修复失败';
      setFixError(message);
      console.error('[AnalyzePage] 修复命令失败:', err);
      
      // 如果是网络错误，提供额外提示
      if (message.includes('网络') || message.includes('fetch')) {
        setFixError('网络连接失败，请检查网络后重试');
      }
    } finally {
      isFixingRef.current = false;
      setIsFixing(false);
    }
  };

  // 手动触发修复
  const handleManualFix = useCallback(() => {
    if (fixRetryCountRef.current >= 3) {
      setFixError('已达到最大重试次数（3 次），请检查原始命令或联系管理员');
      return;
    }
    if (lastCommandErrors && !isFixingRef.current) {
      isFixingRef.current = true;
      fixCommands(lastCommandErrors);
    }
  }, [lastCommandErrors]);

  // 重置修复状态
  const handleResetFix = useCallback(() => {
    fixRetryCountRef.current = 0;
    setFixRetryCount(0);
    setFixError(null);
    setLastCommandErrors(null);
    setShowFixNotification(false);
    setFixSuccess(false);
  }, []);

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-32 text-center">
        <div className="relative">
          <div className="absolute inset-0 blur-3xl bg-primary/20 rounded-full" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-primary/5 shadow-xl shadow-primary/20">
            <AlertCircle className="h-10 w-10 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-2xl font-bold text-foreground">分析结果不存在</p>
          <p className="text-sm text-muted-foreground">结果可能已过期或被删除</p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="group flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:shadow-xl hover:shadow-primary/40 hover:scale-105"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> 返回首页
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <div className="relative h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        </div>
        <p className="text-sm font-medium text-muted-foreground animate-pulse">正在加载分析结果...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* 顶部导航 - 增强视觉 */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b bg-gradient-to-r from-background via-background to-transparent">
        <div className="flex items-center justify-between py-4">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> 
            <span className="hidden sm:inline">返回</span>
          </button>
          
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5">
              <div className="flex h-2 w-2 items-center justify-center rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-medium text-primary">
                {type === 'generate' ? 'AI 生成图形' : 'AI 分析结果'}
              </span>
            </div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
              {type === 'generate' ? '精确几何图形' : '几何题分析结果'}
            </h1>
          </div>

          {/* 学习模式切换按钮 */}
          {parsedSteps.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setStudyMode((v) => !v);
                setHighlightedStepIndex(null);
                setHighlightedCommandIndex(null);
                setSelectedStepExplanation(null);
              }}
              className={cn(
                "group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                studyMode
                  ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
              )}
              title={studyMode ? '退出学习模式' : '进入学习模式'}
            >
              <GraduationCap className="h-4 w-4" />
              <span className="hidden sm:inline">{studyMode ? '退出学习' : '学习模式'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleShare}
            className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all"
            title="复制分享链接"
          >
            {urlCopied ? (
              <><Check className="h-4 w-4 text-green-600" /> <span className="hidden sm:inline text-green-600">已复制</span></>
            ) : (
              <><Share2 className="h-4 w-4 transition-transform group-hover:scale-110" /> <span className="hidden sm:inline">分享链接</span></>
            )}
          </button>
        </div>

        <div className="pb-3 text-center">
          <p className="text-xs text-muted-foreground">
            提示：分享链接已支持跨设备访问，结果将在服务端保留 7 天。
          </p>
        </div>
      </div>

      {/* 修复状态通知 */}
      {showFixNotification && (
        <div className={cn(
          "rounded-lg px-4 py-3 flex items-center gap-3",
          fixSuccess ? "bg-green-50 border border-green-200" : "bg-blue-50 border border-blue-200"
        )}>
          {isFixing ? (
            <>
              <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
              <span className="text-sm text-blue-800">正在修复 GeoGebra 命令（第 {fixRetryCount + 1} 次尝试）...</span>
            </>
          ) : fixSuccess ? (
            <>
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-800">
                命令修复成功！已重新渲染图形（第 {fixRetryCount} 次修复）
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-blue-800">
                检测到 {lastCommandErrors?.failedCount} 条命令执行失败，正在尝试自动修复...
              </span>
            </>
          )}
        </div>
      )}

      {/* 达到最大重试次数的 fallback 提示 */}
      {fixRetryCount >= 3 && lastCommandErrors && !fixError && (
        <div className="rounded-lg px-4 py-3 bg-amber-50 border border-amber-200 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm text-amber-800 font-medium">无法自动修复命令</p>
            <p className="text-xs text-amber-700 mt-1">
              已尝试 3 次修复但仍失败。您可以：
            </p>
            <ul className="text-xs text-amber-700 mt-1 list-disc list-inside space-y-0.5">
              <li>手动检查并修改 GeoGebra 命令</li>
              <li>返回首页重新生成图形</li>
              <li>联系技术支持获取帮助</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={handleResetFix}
            className="text-xs px-3 py-1.5 border border-amber-300 rounded hover:bg-amber-100 transition-colors"
          >
            关闭提示
          </button>
        </div>
      )}

      {/* 修复错误提示 */}
      {fixError && (
        <div className="rounded-lg px-4 py-3 bg-destructive/10 border border-destructive/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <div className="flex flex-col gap-1">
              <span className="text-sm text-destructive">修复失败：{fixError}</span>
              {fixRetryCount >= 3 && (
                <span className="text-xs text-muted-foreground">
                  已达到最大重试次数（3 次）。建议：1) 检查原始命令是否正确；2) 联系管理员；3) 重新生成图形
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {fixRetryCount < 3 && (
              <button
                type="button"
                onClick={handleManualFix}
                className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
              >
                重试修复
              </button>
            )}
            <button
              type="button"
              onClick={handleResetFix}
              className="text-xs px-2 py-1 border rounded hover:bg-muted transition-colors"
            >
              重置
            </button>
          </div>
        </div>
      )}

      {/* 主布局：优化响应式栅格 */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">

        {/* ── 左侧：GeoGebra + 动画控制 ── */}
        <div className="xl:col-span-2 space-y-4">
          <div className="relative overflow-hidden rounded-3xl border bg-card shadow-xl shadow-primary/5">
            {/* 顶部装饰 */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
            
            <div className="p-6 space-y-4">
              {/* 标题行 - 增强视觉 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                    <Layers className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">交互几何图形</h2>
                    {fixRetryCount > 0 && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Check className="h-3 w-3 text-green-600" />
                        已修复 {fixRetryCount} 次
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const ggb = window.ggbApplet;
                      if (!ggb || typeof ggb.exportSVG !== 'function') {
                        throw new Error('GeoGebra API not ready');
                      }
                      const svg = ggb.exportSVG();
                      if (svg) {
                        const blob = new Blob([svg], { type: 'image/svg+xml' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `geometry_${result.id}.svg`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }
                    } catch {
                      alert('导出失败，请使用 GeoGebra 内置导出功能');
                    }
                  }}
                  className="group flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/10 transition-all hover:shadow-md hover:shadow-primary/20"
                  title="导出 SVG"
                >
                  <Download className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" /> 
                  <span className="hidden sm:inline">导出 SVG</span>
                  <span className="sm:hidden">SVG</span>
                </button>
              </div>

              {/* GeoGebra 视图 - 大屏幕更大 */}
              <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-muted/20 to-background">
                <div className="absolute inset-0 bg-grid-primary/[0.02] bg-[size:20px]" />
                <GeoGebraViewer
                  commands={result.geogebra}
                  height={600}
                  showToolbar={false}
                  animationMode={animationMode}
                  commandIndex={cmdIndex}
                  onReady={() => setAppletReady(true)}
                  onCommandError={handleCommandError}
                />
              </div>

              {/* 动画控制 - 增强 UI */}
              <div className="rounded-2xl border bg-gradient-to-r from-primary/5 via-card to-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                    <span className="text-xs">🎬</span>
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">
                    动画演示 <span className="hidden sm:inline">（逐步展示作图过程）</span>
                  </p>
                </div>
                <AnimationControls
                  state={animState}
                  total={commandLines.length}
                  current={cmdIndex === -1 ? commandLines.length - 1 : cmdIndex}
                  speed={animSpeed}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onReset={handleReset}
                  onStep={handleStep}
                  onSpeedChange={handleSpeedChange}
                />
              </div>
            </div>
          </div>

          {/* GeoGebra 命令面板 - 优化视觉 */}
          <div className="relative overflow-hidden rounded-3xl border bg-card shadow-xl shadow-primary/5">
            <button
              type="button"
              onClick={() => setCmdExpanded((v) => !v)}
              className="group flex w-full items-center justify-between px-5 py-4 text-sm font-semibold hover:bg-muted/50 transition-all"
            >
              <span className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 transition-transform group-hover:scale-110">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <p>GeoGebra 命令</p>
                  <p className="text-xs text-muted-foreground font-normal">{commandLines.length} 行</p>
                </div>
              </span>
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl bg-muted/50 transition-all group-hover:scale-110",
                cmdExpanded ? "rotate-180 bg-primary/20" : ""
              )}>
                <ChevronDown className="h-4 w-4 text-primary" />
              </div>
            </button>
            {cmdExpanded && (
              <div className="border-t">
                <div className="p-5 space-y-3">
                  <div className="relative overflow-hidden rounded-2xl border bg-muted/30">
                    <div className="absolute top-3 right-3 z-10">
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="group flex items-center gap-2 rounded-lg border bg-background/90 px-3 py-1.5 text-xs font-medium backdrop-blur-sm hover:bg-muted transition-all hover:shadow-md"
                      >
                        {copied ? (
                          <><Check className="h-3.5 w-3.5 text-green-600" /> 已复制</>
                        ) : (
                          <><Copy className="h-3.5 w-3.5" /> 复制</>
                        )}
                      </button>
                    </div>
                    <div className="code-block max-h-96 overflow-auto p-4 text-xs leading-relaxed bg-gradient-to-br from-muted/50 to-muted/30">
                      {commandLines.map((cmd, idx) => {
                        const isHighlighted = studyMode && highlightedCommandIndex === idx;
                        const relatedSteps = studyMode ? getStepIndicesByCommandIndex(idx) : [];
                        return (
                          <div
                            key={idx}
                            onClick={() => handleCommandClick(idx)}
                            className={cn(
                              "flex items-start gap-2 py-1 px-1.5 rounded cursor-pointer transition-all",
                              isHighlighted
                                ? "bg-amber-100 border border-amber-300"
                                : relatedSteps.length > 0
                                  ? "hover:bg-muted/60"
                                  : ""
                            )}
                          >
                            <span className={cn(
                              "shrink-0 w-6 text-right tabular-nums select-none",
                              isHighlighted ? "text-amber-700 font-bold" : "text-muted-foreground/50"
                            )}>
                              {idx + 1}
                            </span>
                            <span className={cn(
                              "break-all",
                              isHighlighted ? "text-amber-900 font-medium" : "text-muted-foreground"
                            )}>
                              {cmd}
                            </span>
                            {studyMode && relatedSteps.length > 0 && (
                              <span className="shrink-0 ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                步骤 {relatedSteps.map(s => s + 1).join(',')}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/20 text-xs">💡</div>
                    <p className="text-xs text-muted-foreground">
                      可将命令粘贴到{' '}
                      <a
                        href="https://www.geogebra.org/classic"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 underline hover:text-blue-500"
                      >
                        GeoGebra Classic
                      </a>{' '}
                      中使用
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 右侧：合并的信息面板 ── */}
        <div className="space-y-4">
          {/* 合并已知条件和求解目标 */}
          <div className="relative overflow-hidden rounded-3xl border bg-card shadow-xl shadow-primary/5">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
            <div className="p-6 space-y-5">
              {/* 已知条件 */}
              {result.conditions.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10">
                      <ListChecks className="h-4 w-4 text-blue-500" />
                    </div>
                    <h2 className="text-sm font-semibold">已知条件</h2>
                  </div>
                  <div className="space-y-2">
                    {result.conditions.map((cond, i) => (
                      <div
                        key={i}
                        className="group flex items-start gap-3 rounded-xl border border-blue-500/10 bg-blue-500/5 p-3 transition-all hover:border-blue-500/30 hover:shadow-md hover:shadow-blue-500/10"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-xs font-bold text-blue-700">
                          {i + 1}
                        </span>
                        <span className="text-sm leading-relaxed">{cond}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 求解目标 */}
              {result.goal && (
                <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-amber-500/5 to-transparent p-4">
                  <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-gradient-to-br from-amber-500/10 to-transparent blur-xl" />
                  <div className="relative flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
                      <Target className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-amber-800 mb-1">求解目标</h3>
                      <p className="text-sm text-amber-900 leading-relaxed">{result.goal}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 解题步骤（仅分析模式有） */}
          {parsedSteps.length > 0 && (
            <div className="relative overflow-hidden rounded-3xl border bg-card shadow-xl shadow-primary/5">
              <button
                type="button"
                onClick={() => setSolutionExpanded((v) => !v)}
                className="group flex w-full items-center justify-between px-5 py-4 text-sm font-semibold hover:bg-muted/50 transition-all"
              >
                <span className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500/10 transition-transform group-hover:scale-110">
                    <BookOpen className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="text-left">
                    <p>解题思路</p>
                    <p className="text-xs text-muted-foreground font-normal">{parsedSteps.length} 个步骤</p>
                  </div>
                </span>
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl bg-muted/50 transition-all group-hover:scale-110",
                  solutionExpanded ? "rotate-180 bg-green-500/20" : ""
                )}>
                  <ChevronDown className="h-4 w-4 text-green-600" />
                </div>
              </button>
              {solutionExpanded && (
                <div className="border-t px-5 py-4 space-y-2">
                  {parsedSteps.map((step, i) => {
                    const isHighlighted = studyMode && highlightedStepIndex === i;
                    const hasCommands = step.commandIndices.length > 0;
                    return (
                      <div
                        key={i}
                        onClick={() => handleStepClick(i)}
                        className={cn(
                          "group flex flex-col gap-2 rounded-xl border p-3 transition-all",
                          isHighlighted
                            ? "border-amber-400 bg-amber-50 shadow-md shadow-amber-500/10"
                            : "border-green-500/10 bg-green-500/5 hover:border-green-500/30 hover:shadow-md hover:shadow-green-500/10",
                          studyMode && hasCommands ? "cursor-pointer" : ""
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white transition-transform group-hover:scale-110',
                              isHighlighted
                                ? 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-sm'
                                : 'bg-gradient-to-br from-green-500 to-green-600 shadow-sm'
                            )}
                          >
                            {i + 1}
                          </span>
                          <span className="text-sm leading-relaxed">{step.text}</span>
                        </div>
                        {/* 学习模式：显示关联命令 */}
                        {studyMode && hasCommands && (
                          <div className="flex flex-wrap gap-1 ml-10">
                            {step.commandIndices.map((cmdIdx) => (
                              <span
                                key={cmdIdx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCommandClick(cmdIdx);
                                }}
                                className={cn(
                                  "text-[10px] px-2 py-0.5 rounded-full border cursor-pointer transition-all",
                                  highlightedCommandIndex === cmdIdx
                                    ? "bg-amber-100 border-amber-300 text-amber-800"
                                    : "bg-muted border-muted-foreground/20 text-muted-foreground hover:bg-amber-50 hover:border-amber-200"
                                )}
                              >
                                命令 {cmdIdx + 1}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* 单步解释按钮 */}
                        {studyMode && step.explanation && (
                          <div className="ml-10">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStepExplanation(step.explanation ?? null);
                              }}
                              className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg px-2.5 py-1 transition-all"
                            >
                              <Lightbulb className="h-3 w-3" />
                              查看原理
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 单步解释弹窗 */}
          {selectedStepExplanation && (
            <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800 mb-1">几何原理</p>
                    <p className="text-sm text-amber-900 leading-relaxed">{selectedStepExplanation}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedStepExplanation(null)}
                  className="shrink-0 rounded-lg p-1 hover:bg-amber-200/50 transition-colors"
                >
                  <X className="h-4 w-4 text-amber-700" />
                </button>
              </div>
            </div>
          )}

          {/* 操作提示 - 优化视觉 */}
          <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-muted/50 to-muted/30 p-4">
            <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-gradient-to-br from-primary/10 to-transparent blur-xl" />
            <div className="relative space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-xs">💡</div>
                <p className="text-xs font-semibold text-foreground">操作提示</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />
                  鼠标拖动顶点可改变图形形状
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />
                  Shift + 滚轮缩放视图
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />
                  点击右上角重置图标恢复初始状态
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />
                  使用下方动画控制逐步演示作图过程
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
