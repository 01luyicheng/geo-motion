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
} from 'lucide-react';
import { GeoGebraViewer, type CommandExecutionResult } from '@/components/GeoGebraViewer';
import { AnimationControls } from '@/components/AnimationControls';
import { getStoredResult, setStoredResult } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useAnimation } from '@/hooks/useAnimation';
import type { AnalysisResult } from '@/types';

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

  // 修复相关状态
  const [isFixing, setIsFixing] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixRetryCount, setFixRetryCount] = useState(0);
  const [lastCommandErrors, setLastCommandErrors] = useState<CommandExecutionResult | null>(null);
  const [showFixNotification, setShowFixNotification] = useState(false);
  const [fixSuccess, setFixSuccess] = useState(false);
  // 使用 ref 进行同步检查，避免竞态条件
  const isFixingRef = useRef(false);

  // 加载结果
  useEffect(() => {
    const stored = getStoredResult<AnalysisResult>(`analysis:${id}`);
    if (stored) {
      setResult(stored);
    } else {
      setNotFound(true);
    }
  }, [id]);

  const commandLines = result
    ? result.geogebra.split('\n').filter((l) => l.trim())
    : [];

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
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-xl font-semibold text-muted-foreground">
          分析结果不存在或已过期
        </p>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> 返回首页
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> 返回
        </button>
        <h1 className="text-lg font-semibold">
          {type === 'generate' ? '精确几何图形' : '几何题分析结果'}
        </h1>
        <button
          type="button"
          onClick={handleShare}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          title="复制分享链接"
        >
          {urlCopied ? (
            <><Check className="h-4 w-4 text-green-600" /> <span className="text-green-600">已复制</span></>
          ) : (
            <><Share2 className="h-4 w-4" /> 分享</>
          )}
        </button>
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

      {/* 主布局：左侧图形 + 右侧信息 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">

        {/* ── 左侧：GeoGebra + 动画控制 ── */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl border bg-card shadow-sm p-4 space-y-4">
            {/* 标题行 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Layers className="h-4 w-4 text-primary" />
                交互几何图形
                {fixRetryCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    (已修复 {fixRetryCount} 次)
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    // 下载 SVG - 使用 GeoGebra 提供的 ggbApplet 变量直接访问
                    try {
                      // window.ggbApplet 已在全局类型中声明（types/index.ts）
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
                  className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted transition-colors"
                  title="导出 SVG"
                >
                  <Download className="h-3.5 w-3.5" /> SVG
                </button>
              </div>
            </div>

            {/* GeoGebra 视图 */}
            <GeoGebraViewer
              commands={result.geogebra}
              height={440}
              showToolbar={false}
              animationMode={animationMode}
              commandIndex={cmdIndex}
              onReady={() => setAppletReady(true)}
              onCommandError={handleCommandError}
            />

            {/* 动画控制 */}
            <div className="border-t pt-3">
              <p className="mb-2 text-xs text-muted-foreground">
                动画演示（逐步展示作图过程）
              </p>
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

          {/* GeoGebra 命令面板 */}
          <div className="rounded-2xl border bg-card shadow-sm">
            <button
              type="button"
              onClick={() => setCmdExpanded((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                GeoGebra 命令（{commandLines.length} 行）
              </span>
              {cmdExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {cmdExpanded && (
              <div className="border-t px-4 pt-2 pb-4">
                <div className="relative rounded-lg bg-muted/60 p-4">
                  <pre className="code-block whitespace-pre-wrap break-all text-xs leading-relaxed">
                    {result.geogebra}
                  </pre>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="absolute top-2 right-2 flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted transition-colors"
                  >
                    {copied ? (
                      <><Check className="h-3.5 w-3.5 text-green-600" /> 已复制</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> 复制</>
                    )}
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  可将命令粘贴到{' '}
                  <a
                    href="https://www.geogebra.org/classic"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    GeoGebra Classic
                  </a>{' '}
                  中使用
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── 右侧：已知条件、目标、解题步骤 ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* 已知条件 */}
          {result.conditions.length > 0 && (
            <div className="rounded-2xl border bg-card shadow-sm p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="h-4 w-4 text-blue-500" />
                已知条件
              </h2>
              <ul className="space-y-1.5">
                {result.conditions.map((cond, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                      {i + 1}
                    </span>
                    {cond}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 求解目标 */}
          {result.goal && (
            <div className="rounded-2xl border bg-amber-50 shadow-sm p-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
                <Target className="h-4 w-4" />
                求解目标
              </h2>
              <p className="text-sm text-amber-900">{result.goal}</p>
            </div>
          )}

          {/* 解题步骤（仅分析模式有） */}
          {result.solution && result.solution.length > 0 && (
            <div className="rounded-2xl border bg-card shadow-sm">
              <button
                type="button"
                onClick={() => setSolutionExpanded((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-green-600" />
                  解题思路
                </span>
                {solutionExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {solutionExpanded && (
                <div className="border-t px-4 py-4">
                  <ol className="space-y-2">
                    {result.solution.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span
                          className={cn(
                            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white',
                            'bg-green-500'
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* 操作提示 */}
          <div className="rounded-xl border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">操作提示</p>
            <p>• 鼠标拖动顶点可改变图形形状</p>
            <p>• Shift + 滚轮缩放视图</p>
            <p>• 点击右上角重置图标恢复初始状态</p>
            <p>• 使用下方动画控制逐步演示作图过程</p>
          </div>
        </div>
      </div>
    </div>
  );
}
