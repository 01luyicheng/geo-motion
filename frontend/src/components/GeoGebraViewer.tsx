'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

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
}

/** 脚本加载超时时间（毫秒） */
const SCRIPT_LOAD_TIMEOUT = 30000;

let ggbScriptLoaded = false;
let ggbScriptLoading = false;
let ggbScriptError = false;
const ggbReadyCallbacks: ((success: boolean) => void)[] = [];

/** 异步加载 GeoGebra 脚本，确保全局只加载一次 */
function loadGeoGebraScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    // 如果脚本已加载成功，直接返回
    if (ggbScriptLoaded) {
      resolve();
      return;
    }
    
    // 如果脚本之前加载失败，直接拒绝
    if (ggbScriptError) {
      reject(new Error('GeoGebra 脚本加载失败，请刷新页面重试'));
      return;
    }
    
    // 添加回调到队列
    ggbReadyCallbacks.push((success) => {
      if (success) {
        resolve();
      } else {
        reject(new Error('GeoGebra 脚本加载失败'));
      }
    });
    
    // 如果正在加载中，等待结果
    if (ggbScriptLoading) return;
    
    ggbScriptLoading = true;

    const script = document.createElement('script');
    script.src = 'https://www.geogebra.org/apps/deployggb.js';
    script.async = true;
    
    // 设置超时定时器
    const timeoutId = setTimeout(() => {
      ggbScriptError = true;
      ggbScriptLoading = false;
      ggbReadyCallbacks.forEach((cb) => cb(false));
      ggbReadyCallbacks.length = 0;
      console.error('[GeoGebra] 脚本加载超时');
    }, SCRIPT_LOAD_TIMEOUT);
    
    script.onload = () => {
      clearTimeout(timeoutId);
      ggbScriptLoaded = true;
      ggbScriptLoading = false;
      ggbReadyCallbacks.forEach((cb) => cb(true));
      ggbReadyCallbacks.length = 0;
    };
    
    script.onerror = () => {
      clearTimeout(timeoutId);
      ggbScriptError = true;
      ggbScriptLoading = false;
      ggbReadyCallbacks.forEach((cb) => cb(false));
      ggbReadyCallbacks.length = 0;
      console.error('[GeoGebra] 脚本加载失败');
    };
    
    document.head.appendChild(script);
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
}: GeoGebraViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appletInstanceRef = useRef<typeof window.ggbApplet | null>(null);
  const appletIdRef = useRef(`ggb_${Math.random().toString(36).slice(2, 8)}`);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedWidth, setResolvedWidth] = useState(width ?? 0);
  
  // 追踪已执行的命令索引，用于增量执行
  const lastExecutedIndexRef = useRef(-1);
  // 追踪当前的命令内容，用于检测命令变化
  const lastCommandsRef = useRef<string>('');

  // 响应式宽度
  useEffect(() => {
    if (width) {
      setResolvedWidth(width);
      return;
    }
    const el = containerRef.current?.parentElement;
    if (el) {
      setResolvedWidth(el.clientWidth || 700);
    }
  }, [width]);

  const initApplet = useCallback(async () => {
    if (!containerRef.current || resolvedWidth === 0) return;

    try {
      await loadGeoGebraScript();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GeoGebra 加载失败');
      return;
    }

    const ggbApplet = new window.GGBApplet(
      {
        appName: 'geometry',
        width: resolvedWidth,
        height,
        showToolBar: showToolbar,
        showAlgebraInput: false,
        showMenuBar: false,
        enableLabelDrags: true,
        enableShiftDragZoom: true,
        showResetIcon: true,
        language: 'zh',
        id: appletIdRef.current,
        appletOnLoad: () => {
          // GeoGebra API 通过全局 window[id] 暴露
          const api = (window as unknown as Record<string, typeof window.ggbApplet>)[appletIdRef.current];
          appletInstanceRef.current = api;
          setLoaded(true);
          setError(null);
          onReady?.();
        },
      },
      true
    );
    // 清空容器再注入
    containerRef.current.innerHTML = '';
    ggbApplet.inject(containerRef.current);
  }, [resolvedWidth, height, showToolbar, onReady]);

  // 初始化 applet
  useEffect(() => {
    if (resolvedWidth === 0) return;
    initApplet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedWidth]);

  // 执行命令 - 增量执行优化
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
    }

    if (!animationMode || commandIndex === -1) {
      // 一次性全部执行（仅当命令变化时执行）
      if (commandsChanged) {
        lines.forEach((cmd) => {
          try {
            api.evalCommand(cmd.trim());
          } catch {
            console.warn('[GeoGebra] 命令执行失败:', cmd);
          }
        });
        lastExecutedIndexRef.current = lines.length - 1;
      }
    } else {
      // 动画模式：增量执行
      const targetIndex = commandIndex;
      const lastIndex = lastExecutedIndexRef.current;
      
      if (targetIndex < lastIndex) {
        // 回退：需要重建到目标索引
        api.newConstruction();
        for (let i = 0; i <= targetIndex; i++) {
          try {
            api.evalCommand(lines[i].trim());
          } catch {
            console.warn('[GeoGebra] 命令执行失败:', lines[i]);
          }
        }
        lastExecutedIndexRef.current = targetIndex;
      } else if (targetIndex > lastIndex) {
        // 前进：只执行新增的命令
        for (let i = lastIndex + 1; i <= targetIndex && i < lines.length; i++) {
          try {
            api.evalCommand(lines[i].trim());
          } catch {
            console.warn('[GeoGebra] 命令执行失败:', lines[i]);
          }
        }
        lastExecutedIndexRef.current = Math.min(targetIndex, lines.length - 1);
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
              ggbScriptError = false;
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
    const api = (window as unknown as Record<string, typeof window.ggbApplet>)[appletId];
    return api?.exportSVG?.() ?? null;
  } catch {
    return null;
  }
}