import { useState, useRef, useCallback, useEffect } from 'react';
import type { AnimationState } from '@/types';

interface UseAnimationParams {
  /** 总命令行数 */
  commandCount: number;
}

interface UseAnimationReturn {
  appletReady: boolean;
  setAppletReady: (v: boolean) => void;
  animationMode: boolean;
  animState: AnimationState;
  cmdIndex: number;
  animSpeed: number;
  handlePlay: () => void;
  handlePause: () => void;
  handleReset: () => void;
  handleStep: (delta: number) => void;
  handleSpeedChange: (ms: number) => void;
}

/**
 * 管理 GeoGebra 动画播放状态与控制逻辑
 * 封装 play/pause/reset/step/speed 所有交互，避免在页面组件中堆积定时器代码
 *
 * 修复要点：
 * 1. 使用 generationRef 防止多个 interval 同时运行（竞态防护）
 * 2. 使用 cmdIndexRef 保持 interval 回调中的索引与 React state 同步
 * 3. 统一在 stopAnimation 中重置 animState，避免状态不一致
 */
export function useAnimation({ commandCount }: UseAnimationParams): UseAnimationReturn {
  const [appletReady, setAppletReady] = useState(false);
  const [animationMode, setAnimationMode] = useState(false);
  const [animState, setAnimState] = useState<AnimationState>('idle');
  const [cmdIndex, setCmdIndex] = useState(-1);
  const [animSpeed, setAnimSpeed] = useState(1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const replayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 用于防止多个 interval 同时运行的世代计数器
  const generationRef = useRef(0);
  // 用于在 interval 回调中获取最新的 cmdIndex
  const cmdIndexRef = useRef(cmdIndex);

  // 保持 cmdIndexRef 与 React state 同步
  useEffect(() => {
    cmdIndexRef.current = cmdIndex;
  }, [cmdIndex]);

  const stopAnimation = useCallback(() => {
    generationRef.current += 1;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (replayTimeoutRef.current) {
      clearTimeout(replayTimeoutRef.current);
      replayTimeoutRef.current = null;
    }
    // 统一重置动画状态，避免外部调用后状态不一致
    setAnimState('idle');
  }, []);

  /**
   * 从指定索引启动 interval 定时推进 cmdIndex
   * 统一封装：设置 animationMode/animState，创建 interval，处理到达末尾逻辑
   */
  const startIntervalFrom = useCallback(
    (startIndex: number, speed: number) => {
      setAnimationMode(true);
      setAnimState('playing');

      const generation = ++generationRef.current;
      let cur = startIndex;
      intervalRef.current = setInterval(() => {
        if (generation !== generationRef.current) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          return;
        }
        cur += 1;
        if (cur >= commandCount) {
          stopAnimation();
          setCmdIndex(commandCount - 1);
          setAnimState('finished');
          return;
        }
        setCmdIndex(cur);
      }, speed);
    },
    [commandCount, stopAnimation]
  );

  const handlePlay = useCallback(() => {
    if (!appletReady || commandCount === 0) return;
    if (animState === 'playing' || intervalRef.current !== null) return;
    if (replayTimeoutRef.current) return;

    let startIdx = cmdIndex;
    if (animState === 'finished' || cmdIndex >= commandCount - 1) {
      setCmdIndex(-1);
      startIdx = -1;
      setAnimationMode(false);
      setAnimState('idle');
      stopAnimation();
      // 记录当前世代，timeout 回调中检查防止旧 timeout 执行
      const generation = generationRef.current;
      const timeoutId = setTimeout(() => {
        // 先检查世代：如果已经调用了 stopAnimation（如用户重置），忽略旧 timeout
        if (generation !== generationRef.current) return;
        // 再检查 timeout 是否已被取消
        if (replayTimeoutRef.current !== timeoutId) return;
        // 再次检查 commandCount，防止在 timeout 等待期间命令被清空
        if (commandCount === 0) {
          replayTimeoutRef.current = null;
          return;
        }
        replayTimeoutRef.current = null;
        setCmdIndex(0);
        setAnimationMode(true);
        setAnimState('playing');
      }, 200);
      replayTimeoutRef.current = timeoutId;
      return;
    }

    const nextIndex = startIdx === -1 ? 0 : startIdx + 1;
    setCmdIndex(nextIndex);
    startIntervalFrom(nextIndex, animSpeed);
  }, [appletReady, animState, cmdIndex, commandCount, animSpeed, stopAnimation, startIntervalFrom]);

  const handlePause = useCallback(() => {
    stopAnimation();
    // stopAnimation 已将状态设为 idle，这里覆盖为 paused
    setAnimState('paused');
  }, [stopAnimation]);

  const handleReset = useCallback(() => {
    stopAnimation();
    setAnimationMode(false);
    setCmdIndex(-1);
    setAnimState('idle');
  }, [stopAnimation]);

  const handleStep = useCallback(
    (delta: number) => {
      if (commandCount === 0) return;
      stopAnimation();
      setAnimationMode(true);
      setAnimState('paused');
      setCmdIndex((prev) => {
        const next = prev + delta;
        if (next < 0) return 0;
        if (next >= commandCount) return commandCount - 1;
        return next;
      });
    },
    [commandCount, stopAnimation]
  );

  const handleSpeedChange = useCallback(
    (ms: number) => {
      setAnimSpeed(ms);
      if (replayTimeoutRef.current) {
        // 处于重播等待期时：取消等待并立即以新速度从头播放
        stopAnimation();
        if (commandCount > 0) {
          setCmdIndex(0);
          startIntervalFrom(0, ms);
        }
        return;
      }
      if (animState === 'playing') {
        stopAnimation();
        // 使用 ref 获取最新的 cmdIndex，避免闭包陷阱
        const currentIdx = cmdIndexRef.current;
        startIntervalFrom(currentIdx, ms);
      }
    },
    [animState, commandCount, stopAnimation, startIntervalFrom]
  );

  // 组件卸载时清理定时器
  useEffect(() => () => stopAnimation(), [stopAnimation]);

  return {
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
  };
}
