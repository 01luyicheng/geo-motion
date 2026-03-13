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
  handleStep: (delta: 1 | -1) => void;
  handleSpeedChange: (ms: number) => void;
}

/**
 * 管理 GeoGebra 动画播放状态与控制逻辑
 * 封装 play/pause/reset/step/speed 所有交互，避免在页面组件中堆积定时器代码
 */
export function useAnimation({ commandCount }: UseAnimationParams): UseAnimationReturn {
  const [appletReady, setAppletReady] = useState(false);
  const [animationMode, setAnimationMode] = useState(false);
  const [animState, setAnimState] = useState<AnimationState>('idle');
  const [cmdIndex, setCmdIndex] = useState(-1);
  const [animSpeed, setAnimSpeed] = useState(1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const replayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAnimation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (replayTimeoutRef.current) {
      clearTimeout(replayTimeoutRef.current);
      replayTimeoutRef.current = null;
    }
  }, []);

  const handlePlay = useCallback(() => {
    if (!appletReady) return;

    let startIdx = cmdIndex;
    if (animState === 'finished' || cmdIndex >= commandCount - 1) {
      setCmdIndex(-1);
      startIdx = -1;
      setAnimationMode(false);
      if (replayTimeoutRef.current) clearTimeout(replayTimeoutRef.current);
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
      if (cur >= commandCount) {
        stopAnimation();
        setCmdIndex(commandCount - 1);
        setAnimState('finished');
        return;
      }
      setCmdIndex(cur);
    }, animSpeed);
  }, [appletReady, animState, cmdIndex, commandCount, animSpeed, stopAnimation]);

  const handlePause = useCallback(() => {
    stopAnimation();
    setAnimState('paused');
  }, [stopAnimation]);

  const handleReset = useCallback(() => {
    stopAnimation();
    setAnimationMode(false);
    setCmdIndex(-1);
    setAnimState('idle');
  }, [stopAnimation]);

  const handleStep = useCallback(
    (delta: 1 | -1) => {
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
      if (animState === 'playing') {
        stopAnimation();
        let cur = cmdIndex;
        intervalRef.current = setInterval(() => {
          cur += 1;
          if (cur >= commandCount) {
            stopAnimation();
            setCmdIndex(commandCount - 1);
            setAnimState('finished');
            return;
          }
          setCmdIndex(cur);
        }, ms);
      }
    },
    [animState, cmdIndex, commandCount, stopAnimation]
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
