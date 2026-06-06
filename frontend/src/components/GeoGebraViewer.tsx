'use client';

import { useEffect, useRef, useState, useCallback, useId } from 'react';
import { cn } from '@/lib/utils';
import type { GgbAppletAPI } from '@/types';

/**
 * 辅助函数：通过 applet ID 获取 GeoGebra API 实例（Issue #15：集中管理类型断言）
 */
function getGgbAppletById(id: string): GgbAppletAPI | undefined {
  return (window as unknown as Record<string, GgbAppletAPI | undefined>)[id];
}

/**
 * 统一清理 GeoGebra applet 实例：销毁并移除全局引用，避免内存泄漏
 */
function cleanupApplet(id: string): void {
  const api = getGgbAppletById(id);
  if (api && typeof api.remove === 'function') {
    try {
      api.remove();
    } catch {
      // 忽略清理错误
    }
  }
  delete (window as unknown as Record<string, unknown>)[id];
}

/** 命令执行错误信息 */
export interface CommandError {
  command: string;
  error: string;
  index: number;
}

/** 命令执行结果 */
export interface CommandExecutionResult {
  success: boolean;
  executedCount: number;
  failedCount: number;
  errors: CommandError[];
}

interface GeoGebraViewerProps {
  /** 多行 GeoGebra 命令 */
  commands: string;
  width?: number;
  height?: number;
  showToolbar?: boolean;
  className?: string;
  /** 是否启用逐行动画播放（由父组件控制） */
  animationMode?: boolean;
  /** 当前应该执行到的命令索引（-1 = 全部执行） */
  commandIndex?: number;
  /** 当 applet 就绪时回调 */
  onReady?: () => void;
  /** 当命令执行出错时回调 */
  onCommandError?: (result: CommandExecutionResult) => void;
  /** 命令执行完成回调（无论成功与否） */
  onCommandComplete?: (result: CommandExecutionResult) => void;
}

/** 脚本加载超时时间（毫秒） */
const SCRIPT_LOAD_TIMEOUT = 30000;

/** 全局脚本标签管理：只插入一次 script 标签 */
function ensureGlobalScriptTag(): void {
  const existing = document.querySelector<HTMLScriptElement>(
    'script[src="https://www.geogebra.org/apps/deployggb.js"]'
  );
  if (existing) return;

  const script = document.createElement('script');
  script.src = 'https://www.geogebra.org/apps/deployggb.js';
  script.async = true;
  document.head.appendChild(script);
}

/** 异步加载 GeoGebra 脚本 */
function loadGeoGebraScript(
  signal: AbortSignal,
  onStateChange?: (state: 'loading' | 'loaded' | 'error') => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    // 如果全局已经加载成功（window.GGBApplet 存在）
    if (typeof window.GGBApplet !== 'undefined') {
      onStateChange?.('loaded');
      resolve();
      return;
    }

    // 确保全局 script 标签已插入
    ensureGlobalScriptTag();

    onStateChange?.('loading');

    const checkInterval = 100;
    const maxChecks = SCRIPT_LOAD_TIMEOUT / checkInterval;
    let checks = 0;

    const intervalId = setInterval(() => {
      if (signal.aborted) {
        clearInterval(intervalId);
        onStateChange?.('error');
        reject(new Error('GeoGebra 脚本加载已取消'));
        return;
      }

      if (typeof window.GGBApplet !== 'undefined') {
        clearInterval(intervalId);
        onStateChange?.('loaded');
        resolve();
        return;
      }

      checks++;
      if (checks >= maxChecks) {
        clearInterval(intervalId);
        onStateChange?.('error');
        reject(new Error('GeoGebra 脚本加载超时'));
      }
    }, checkInterval);
  });
}

export function GeoGebraViewer({
  commands,
  width,
  height = 480,
  showToolbar = false,
  className,
  animationMode = false,
  commandIndex = -1,
  onReady,
  onCommandError,
  onCommandComplete,
}: GeoGebraViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appletInstanceRef = useRef<GgbAppletAPI | null>(null);
  // 使用 useId 生成稳定的 ID，避免 SSR/hydration 不匹配（替代 Math.random()）
  const reactId = useId();
  // 每次 initApplet 调用都递增的实例 ID，确保新旧实例使用不同 ID（修复竞态）
  const instanceIdRef = useRef(0);
  const appletIdRef = useRef(`ggb_${reactId.replace(/:/g, '')}_0`);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedWidth, setResolvedWidth] = useState(width ?? 0);

  // 脚本加载状态由组件实例独立管理（修复全局状态污染）
  const abortControllerRef = useRef<AbortController | null>(null);
  // 实例世代计数器：防止旧实例的回调覆盖新实例状态
  const instanceGenerationRef = useRef(0);

  // 使用 ref 跟踪最新的 onReady 回调，避免 initApplet 依赖它（Issue #16）
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // 使用 ref 跟踪最新的 onCommandError / onCommandComplete 回调
  // 避免命令执行 effect 因回调引用变化而无限循环
  const onCommandErrorRef = useRef(onCommandError);
  onCommandErrorRef.current = onCommandError;
  const onCommandCompleteRef = useRef(onCommandComplete);
  onCommandCompleteRef.current = onCommandComplete;

  // 追踪已执行的命令索引，用于增量执行
  const lastExecutedIndexRef = useRef(-1);
  // 追踪当前的命令内容，用于检测命令变化
  const lastCommandsRef = useRef<string>('');
  // 追踪已报告错误的命令内容，避免重复报告同一错误（修复无限循环风险）
  const reportedErrorForCommandsRef = useRef<string | null>(null);
  // 错误计数器，防止过多错误刷屏
  const errorCountRef = useRef(0);
  const maxErrorCount = 10; // 最多显示 10 个错误

  // 响应式宽度
  useEffect(() => {
    if (width) {
      setResolvedWidth(width);
      return;
    }

    const updateWidth = () => {
      const el = containerRef.current?.parentElement;
      if (el) {
        setResolvedWidth(el.clientWidth || 700);
      }
    };

    updateWidth();

    // 添加窗口大小变化监听（节流：每 200ms 最多触发一次，减少频繁 resize 导致的 applet 重建）
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const throttledUpdateWidth = () => {
      if (resizeTimeout) return;
      resizeTimeout = setTimeout(() => {
        resizeTimeout = null;
        updateWidth();
      }, 200);
    };
    window.addEventListener('resize', throttledUpdateWidth);
    return () => {
      window.removeEventListener('resize', throttledUpdateWidth);
      if (resizeTimeout) clearTimeout(resizeTimeout);
    };
  }, [width]);

  const initApplet = useCallback(async () => {
    if (!containerRef.current || resolvedWidth === 0) return;

    // 重置加载和错误状态，确保旧内容隐藏、加载指示器显示
    setLoaded(false);
    setError(null);

    // 取消之前的加载请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 新实例世代，旧实例的回调将被忽略
    const generation = ++instanceGenerationRef.current;
    // 递增实例 ID，确保新旧实例使用不同 ID（修复 useId 不变导致的竞态）
    const instanceId = ++instanceIdRef.current;
    // 先清理旧实例（使用旧的 appletIdRef.current）
    cleanupApplet(appletIdRef.current);
    appletInstanceRef.current = null;
    // 再生成新 ID
    const currentId = `ggb_${reactId.replace(/:/g, '')}_${instanceId}`;
    appletIdRef.current = currentId;

    try {
      await loadGeoGebraScript(controller.signal);
    } catch (err) {
      // 检查世代：如果已经发起了新实例，忽略旧错误
      if (generation !== instanceGenerationRef.current) return;
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'GeoGebra 加载失败');
      }
      return;
    }

    // 再次检查世代，防止脚本加载期间组件已重新初始化
    if (generation !== instanceGenerationRef.current) return;

    const ggbApplet = new window.GGBApplet(
      {
        appName: 'classic',           // 改为 classic 模式，避免左侧空白区域
        width: resolvedWidth,
        height,
        showToolBar: showToolbar,     // 使用传入的 showToolbar prop
        showAlgebraInput: false,
        showMenuBar: false,
        enableLabelDrags: false,      // 禁止拖动标签
        enableShiftDragZoom: true,    // 允许 Shift+拖动 缩放
        showResetIcon: true,
        language: 'zh',
        id: currentId,
        showErrorDialogs: false,      // 禁用错误弹窗
        appletOnLoad: () => {
          // 检查世代：确保这是最新实例的回调
          if (generation !== instanceGenerationRef.current) {
            // 旧实例的回调，清理它
            cleanupApplet(currentId);
            return;
          }
          // GeoGebra API 通过全局 window[id] 暴露
          const api = getGgbAppletById(currentId);
          appletInstanceRef.current = api ?? null;
          setLoaded(true);
          setError(null);
          onReadyRef.current?.();
        },
      },
      true
    );
    // 清空容器再注入
    containerRef.current.innerHTML = '';
    ggbApplet.inject(containerRef.current);
  }, [resolvedWidth, height, showToolbar]);

  // 初始化 applet（仅在宽度变化时重新初始化，Issue #16：移除 eslint-disable）
  useEffect(() => {
    if (resolvedWidth === 0) return;
    void initApplet();

    return () => {
      // 组件卸载时递增世代，确保旧实例的回调被忽略（修复竞态）
      instanceGenerationRef.current += 1;
      // 取消正在进行的脚本加载并销毁 applet 实例
      abortControllerRef.current?.abort();
      cleanupApplet(appletIdRef.current);
      appletInstanceRef.current = null;
    };
  }, [initApplet]);

  // 执行命令 - 增量执行优化，并捕获错误
  useEffect(() => {
    const api = appletInstanceRef.current;
    if (!loaded || !api) return;

    const lines = commands.split('\n').filter((l) => l.trim());
    const commandsChanged = lastCommandsRef.current !== commands;

    // 如果命令内容变化，重置状态并重新执行
    if (commandsChanged) {
      api.newConstruction();
      lastExecutedIndexRef.current = -1;
      lastCommandsRef.current = commands;
      // 命令变化时才重置错误报告状态（避免无限循环）
      reportedErrorForCommandsRef.current = null;
      // 重置错误计数器
      errorCountRef.current = 0;
    }

    // 收集执行结果
    const executionResult: CommandExecutionResult = {
      success: true,
      executedCount: 0,
      failedCount: 0,
      errors: [],
    };

    // 执行单条命令并捕获错误
    const executeCommand = (cmd: string, index: number): boolean => {
      const trimmedCmd = cmd.trim();
      if (!trimmedCmd) return true;

      try {
        // GeoGebra API 的 evalCommand 返回布尔值表示成功/失败
        const success = api.evalCommand(trimmedCmd);
        if (success) {
          executionResult.executedCount++;
          return true;
        } else {
          // 命令执行失败（返回 false）
          executionResult.failedCount++;
          errorCountRef.current += 1;
          executionResult.errors.push({
            command: trimmedCmd,
            error: '命令执行失败（GeoGebra 返回 false）',
            index,
          });
          if (errorCountRef.current <= maxErrorCount) {
            console.warn('[GeoGebra] 命令执行失败:', trimmedCmd);
          } else if (errorCountRef.current === maxErrorCount + 1) {
            console.warn('[GeoGebra] 错误过多，不再显示详细日志');
          }
          return false;
        }
      } catch (err) {
        // 命令执行抛出异常
        executionResult.failedCount++;
        errorCountRef.current += 1;
        const errorMessage = err instanceof Error ? err.message : '未知错误';
        executionResult.errors.push({
          command: trimmedCmd,
          error: errorMessage,
          index,
        });
        if (errorCountRef.current <= maxErrorCount) {
          console.warn('[GeoGebra] 命令执行异常:', trimmedCmd, err);
        } else if (errorCountRef.current === maxErrorCount + 1) {
          console.warn('[GeoGebra] 错误过多，不再显示详细日志');
        }
        return false;
      }
    };

    // 报告执行结果的辅助函数
    const reportExecutionResult = () => {
      executionResult.success = executionResult.failedCount === 0;
      if (executionResult.failedCount > 0 && reportedErrorForCommandsRef.current !== commands) {
        reportedErrorForCommandsRef.current = commands;
        onCommandErrorRef.current?.(executionResult);
      }
      onCommandCompleteRef.current?.(executionResult);
    };

    if (!animationMode || commandIndex === -1) {
      // 一次性全部执行（仅当命令变化时执行）
      if (commandsChanged) {
        lines.forEach((cmd, index) => {
          executeCommand(cmd, index);
        });
        lastExecutedIndexRef.current = lines.length - 1;
        reportExecutionResult();
      }
    } else {
      // 动画模式：增量执行
      const targetIndex = commandIndex;
      const lastIndex = lastExecutedIndexRef.current;

      if (targetIndex < lastIndex) {
        // 回退：需要重建到目标索引
        api.newConstruction();
        for (let i = 0; i <= targetIndex; i++) {
          executeCommand(lines[i], i);
        }
        lastExecutedIndexRef.current = targetIndex;
        reportExecutionResult();
      } else if (targetIndex > lastIndex) {
        // 前进：只执行新增的命令
        for (let i = lastIndex + 1; i <= targetIndex && i < lines.length; i++) {
          executeCommand(lines[i], i);
        }
        lastExecutedIndexRef.current = Math.min(targetIndex, lines.length - 1);
        reportExecutionResult();
      }
      // targetIndex === lastIndex 时无需操作
    }
  }, [loaded, commands, animationMode, commandIndex]);

  return (
    <div className={cn('ggb-container relative w-full', className)}>
      {error && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-destructive/10 rounded-lg"
          style={{ minHeight: height }}
        >
          <p className="text-sm text-destructive font-medium">加载失败</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            onClick={() => {
              setError(null);
              initApplet();
            }}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            重试
          </button>
        </div>
      )}
      {!loaded && !error && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/40 rounded-lg"
          style={{ minHeight: height }}
        >
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">加载 GeoGebra 中…</p>
        </div>
      )}
      <div
        ref={containerRef}
        style={{ minHeight: height }}
        className={cn((!loaded || error) && 'invisible')}
      />
    </div>
  );
}

/** 导出为 SVG 字符串（需要 applet 已就绪） */
export function exportGeoGebraSvg(appletId: string): string | null {
  try {
    const api = getGgbAppletById(appletId);
    return api?.exportSVG?.() ?? null;
  } catch {
    return null;
  }
}
