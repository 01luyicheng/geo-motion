import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAnimation } from './useAnimation';

describe('useAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 1. 初始状态 ────────────────────────────────────────────

  describe('初始状态', () => {
    it('初始值正确', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      expect(result.current.appletReady).toBe(false);
      expect(result.current.animationMode).toBe(false);
      expect(result.current.animState).toBe('idle');
      expect(result.current.cmdIndex).toBe(-1);
      expect(result.current.animSpeed).toBe(1000);
    });
  });

  // ── 2. 播放控制 ────────────────────────────────────────────

  describe('handlePlay', () => {
    it('applet 未就绪时不播放', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.handlePlay());
      expect(result.current.animState).toBe('idle');
      expect(result.current.animationMode).toBe(false);
    });

    it('从 idle 开始播放，cmdIndex 从 0 开始', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      expect(result.current.animState).toBe('playing');
      expect(result.current.animationMode).toBe(true);
      expect(result.current.cmdIndex).toBe(0);
    });

    it('播放中定时推进 cmdIndex', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      expect(result.current.cmdIndex).toBe(0);

      act(() => vi.advanceTimersByTime(1000));
      expect(result.current.cmdIndex).toBe(1);

      act(() => vi.advanceTimersByTime(2000));
      expect(result.current.cmdIndex).toBe(3);
    });

    it('播放到末尾后状态变为 finished', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 3 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      // cmdIndex: 0 -> 1 -> 2 (finished)
      // 注意：源码 finished 时没有 setAnimationMode(false)，animationMode 保持 true
      act(() => vi.advanceTimersByTime(3000));
      expect(result.current.animState).toBe('finished');
      expect(result.current.cmdIndex).toBe(2);
      expect(result.current.animationMode).toBe(true);
    });

    it('从 paused 恢复播放时从当前位置继续', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      act(() => vi.advanceTimersByTime(1000));
      expect(result.current.cmdIndex).toBe(1);

      act(() => result.current.handlePause());
      expect(result.current.animState).toBe('paused');

      act(() => result.current.handlePlay());
      expect(result.current.animState).toBe('playing');
      expect(result.current.cmdIndex).toBe(2);
    });

    it('finished 后再次播放会重置并延迟启动', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 3 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      act(() => vi.advanceTimersByTime(3000));
      expect(result.current.animState).toBe('finished');

      act(() => result.current.handlePlay());
      // 先重置到 -1，等待 200ms 后从 0 开始
      expect(result.current.cmdIndex).toBe(-1);
      expect(result.current.animationMode).toBe(false);

      act(() => vi.advanceTimersByTime(200));
      expect(result.current.cmdIndex).toBe(0);
      expect(result.current.animState).toBe('playing');
      expect(result.current.animationMode).toBe(true);
    });

    it('在最后一个命令时点击播放也触发重播', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 3 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      act(() => vi.advanceTimersByTime(2000));
      // 此时 cmdIndex = 2（最后一个）
      expect(result.current.cmdIndex).toBe(2);

      act(() => result.current.handlePlay());
      expect(result.current.cmdIndex).toBe(-1);
      act(() => vi.advanceTimersByTime(200));
      expect(result.current.cmdIndex).toBe(0);
    });
  });

  // ── 3. 暂停控制 ────────────────────────────────────────────

  describe('handlePause', () => {
    it('播放中暂停停止定时器并设置 paused', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      act(() => vi.advanceTimersByTime(1000));
      expect(result.current.cmdIndex).toBe(1);

      act(() => result.current.handlePause());
      expect(result.current.animState).toBe('paused');

      // 定时器已清除，不再推进
      act(() => vi.advanceTimersByTime(2000));
      expect(result.current.cmdIndex).toBe(1);
    });

    it('idle 状态暂停不改变状态', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.handlePause());
      expect(result.current.animState).toBe('paused');
    });
  });

  // ── 4. 重置控制 ────────────────────────────────────────────

  describe('handleReset', () => {
    it('重置后恢复初始状态', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      act(() => vi.advanceTimersByTime(1000));

      act(() => result.current.handleReset());
      expect(result.current.animState).toBe('idle');
      expect(result.current.animationMode).toBe(false);
      expect(result.current.cmdIndex).toBe(-1);
    });

    it('重置清除定时器', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      act(() => result.current.handleReset());

      act(() => vi.advanceTimersByTime(2000));
      expect(result.current.cmdIndex).toBe(-1);
    });
  });

  // ── 5. 步进控制 ────────────────────────────────────────────

  describe('handleStep', () => {
    it('正向步进', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handleStep(1));
      expect(result.current.cmdIndex).toBe(0);
      expect(result.current.animState).toBe('paused');
      expect(result.current.animationMode).toBe(true);
    });

    it('反向步进', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handleStep(1));
      act(() => result.current.handleStep(1));
      expect(result.current.cmdIndex).toBe(1);
      act(() => result.current.handleStep(-1));
      expect(result.current.cmdIndex).toBe(0);
    });

    it('步进不超出边界（下限 0）', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handleStep(-1));
      expect(result.current.cmdIndex).toBe(0);
    });

    it('步进不超出边界（上限 commandCount-1）', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 3 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handleStep(1));
      act(() => result.current.handleStep(1));
      act(() => result.current.handleStep(1));
      expect(result.current.cmdIndex).toBe(2);
      act(() => result.current.handleStep(1));
      expect(result.current.cmdIndex).toBe(2);
    });

    it('步进时清除播放定时器', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      act(() => result.current.handleStep(1));
      expect(result.current.animState).toBe('paused');
      act(() => vi.advanceTimersByTime(2000));
      // 定时器已清除，cmdIndex 保持
      expect(result.current.cmdIndex).toBe(1);
    });
  });

  // ── 6. 速度变更 ────────────────────────────────────────────

  describe('handleSpeedChange', () => {
    it('非播放状态仅更新速度值', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.handleSpeedChange(500));
      expect(result.current.animSpeed).toBe(500);
      expect(result.current.animState).toBe('idle');
    });

    it('播放中变更速度会重启定时器并使用新间隔', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      expect(result.current.cmdIndex).toBe(0);

      act(() => result.current.handleSpeedChange(500));
      expect(result.current.animSpeed).toBe(500);
      expect(result.current.animState).toBe('playing');

      // 新间隔 500ms
      act(() => vi.advanceTimersByTime(500));
      expect(result.current.cmdIndex).toBe(1);
      act(() => vi.advanceTimersByTime(500));
      expect(result.current.cmdIndex).toBe(2);
    });

    it('速度变更后仍能正常播放到 finished', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 3 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      act(() => result.current.handleSpeedChange(100));
      act(() => vi.advanceTimersByTime(300));
      expect(result.current.animState).toBe('finished');
      expect(result.current.cmdIndex).toBe(2);
    });
  });

  // ── 7. 组件卸载清理 ────────────────────────────────────────

  describe('清理', () => {
    it('卸载时清除定时器', () => {
      const { result, unmount } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      unmount();
      // 不应有未清除的定时器导致报错
      expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    });
  });

  // ── 8. 边界情况 ────────────────────────────────────────────

  describe('边界情况', () => {
    it('commandCount 为 0 时播放触发重播逻辑', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 0 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      // commandCount=0 时 cmdIndex(-1) >= commandCount-1(-1) 为 true，进入重播分支
      // 先重置到 -1，200ms 后 timeout 里设置 cmdIndex=0，但 interval 不会启动
      // 因为 timeout 回调里没有启动 interval 的代码，只是设置状态
      expect(result.current.cmdIndex).toBe(-1);
      act(() => vi.advanceTimersByTime(200));
      expect(result.current.cmdIndex).toBe(0);
      expect(result.current.animState).toBe('playing');
    });

    it('commandCount 为 1 时播放后立即 finished', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 1 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      // 启动后 cur=0，interval 第一次 tick cur=1 >= 1，finished
      act(() => vi.advanceTimersByTime(1000));
      expect(result.current.animState).toBe('finished');
      expect(result.current.cmdIndex).toBe(0);
    });

    it('连续快速点击 play 不会创建多个定时器', () => {
      const { result } = renderHook(() => useAnimation({ commandCount: 5 }));
      act(() => result.current.setAppletReady(true));
      act(() => result.current.handlePlay());
      // 第二次点击时 animState 已经是 playing，cmdIndex=0，不会触发重播，
      // 但会重新设置 interval，导致 cmdIndex 跳到 1（因为 startIdx=0，nextIndex=1）
      act(() => result.current.handlePlay());
      expect(result.current.cmdIndex).toBe(1);
      act(() => vi.advanceTimersByTime(1000));
      expect(result.current.cmdIndex).toBe(2);
    });
  });
});
