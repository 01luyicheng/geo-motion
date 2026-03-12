'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
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
} from 'lucide-react';
import { GeoGebraViewer } from '@/components/GeoGebraViewer';
import { AnimationControls } from '@/components/AnimationControls';
import { getStoredResult } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { AnalysisResult, AnimationState } from '@/types';

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

  // GeoGebra 动画状态
  const [appletReady, setAppletReady] = useState(false);
  const [animationMode, setAnimationMode] = useState(false);
  const [animState, setAnimState] = useState<AnimationState>('idle');
  const [cmdIndex, setCmdIndex] = useState(-1);  // -1 表示全部执行
  const [animSpeed, setAnimSpeed] = useState(1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const replayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 命令面板展开控制
  const [cmdExpanded, setCmdExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  // 解题步骤展开
  const [solutionExpanded, setSolutionExpanded] = useState(true);

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

  // 停止动画
  const stopAnimation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // 清理重播延迟定时器
    if (replayTimeoutRef.current) {
      clearTimeout(replayTimeoutRef.current);
      replayTimeoutRef.current = null;
    }
  }, []);

  // 播放动画
  const handlePlay = useCallback(() => {
    if (!appletReady) return;

    // 若已结束，先重置
    let startIdx = cmdIndex;
    if (animState === 'finished' || cmdIndex >= commandLines.length - 1) {
      setCmdIndex(-1);
      startIdx = -1;
      setAnimationMode(false);
      // 清理之前的重播延迟定时器，避免竞态条件
      if (replayTimeoutRef.current) {
        clearTimeout(replayTimeoutRef.current);
      }
      // 短暂延迟后切回动画模式开始播放
      replayTimeoutRef.current = setTimeout(() => {
        replayTimeoutRef.current = null;
        setCmdIndex(0);
        setAnimationMode(true);
        setAnimState('playing');
      }, 200);
      return;
    }

    setAnimationMode(true);
    setAnimState('playing');

    const nextIndex = startIdx === -1 ? 0 : startIdx + 1;
    setCmdIndex(nextIndex);

    let cur = nextIndex;
    intervalRef.current = setInterval(() => {
      cur += 1;
      if (cur >= commandLines.length) {
        stopAnimation();
        setCmdIndex(commandLines.length - 1);
        setAnimState('finished');
        return;
      }
      setCmdIndex(cur);
    }, animSpeed);
  }, [appletReady, animState, cmdIndex, commandLines.length, animSpeed, stopAnimation]);

  // 暂停
  const handlePause = useCallback(() => {
    stopAnimation();
    setAnimState('paused');
  }, [stopAnimation]);

  // 重置
  const handleReset = useCallback(() => {
    stopAnimation();
    setAnimationMode(false);
    setCmdIndex(-1);
    setAnimState('idle');
  }, [stopAnimation]);

  // 单步
  const handleStep = useCallback(
    (delta: 1 | -1) => {
      stopAnimation();
      setAnimationMode(true);
      setAnimState('paused');
      setCmdIndex((prev) => {
        const next = prev + delta;
        if (next < 0) return 0;
        if (next >= commandLines.length) return commandLines.length - 1;
        return next;
      });
    },
    [commandLines.length, stopAnimation]
  );

  // 改变速度（若正在播放则重启定时器）
  const handleSpeedChange = useCallback(
    (ms: number) => {
      setAnimSpeed(ms);
      if (animState === 'playing') {
        stopAnimation();
        // 用新速度重新开始
        let cur = cmdIndex;
        intervalRef.current = setInterval(() => {
          cur += 1;
          if (cur >= commandLines.length) {
            stopAnimation();
            setCmdIndex(commandLines.length - 1);
            setAnimState('finished');
            return;
          }
          setCmdIndex(cur);
        }, ms);
      }
    },
    [animState, cmdIndex, commandLines.length, stopAnimation]
  );

  // 清理
  useEffect(() => () => stopAnimation(), [stopAnimation]);

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
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    // 下载 SVG - 使用 GeoGebra 提供的 ggbApplet 变量直接访问
                    try {
                      const ggb = (window as unknown as { ggbApplet?: typeof window.ggbApplet }).ggbApplet;
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
