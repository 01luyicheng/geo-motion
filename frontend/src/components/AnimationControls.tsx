'use client';

import { Play, Pause, RotateCcw, SkipForward, SkipBack, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AnimationState } from '@/types';

interface AnimationControlsProps {
  state: AnimationState;
  total: number;          // 命令总行数
  current: number;        // 当前已执行到的行（0-based）
  speed: number;          // 播放间隔 ms
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onStep: (delta: 1 | -1) => void;
  onSpeedChange: (ms: number) => void;
  className?: string;
}

const SPEED_OPTIONS = [
  { label: '0.5×', value: 2000 },
  { label: '1×', value: 1000 },
  { label: '2×', value: 500 },
  { label: '3×', value: 333 },
];

export function AnimationControls({
  state,
  total,
  current,
  speed,
  onPlay,
  onPause,
  onReset,
  onStep,
  onSpeedChange,
  className,
}: AnimationControlsProps) {
  const isPlaying = state === 'playing';
  const isFinished = state === 'finished';
  const progress = total > 0 ? ((current + 1) / total) * 100 : 0;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* 进度条 */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="w-8 text-right tabular-nums">
          {Math.min(current + 1, total)}
        </span>
        <div className="relative flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="w-8 tabular-nums">{total}</span>
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {/* 单步后退（更精细的控制） */}
        <button
          type="button"
          onClick={() => onStep(-1)}
          disabled={current <= 0}
          className="rounded-md p-2 hover:bg-muted disabled:opacity-40 transition-colors"
          title="后退一步"
          aria-label="后退一步"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* 跳转到开头 */}
        <button
          type="button"
          onClick={() => onStep(-current)}
          disabled={current <= 0}
          className="rounded-md p-2 hover:bg-muted disabled:opacity-40 transition-colors"
          title="跳转到开头"
          aria-label="跳转到开头"
        >
          <SkipBack className="h-4 w-4" />
        </button>

        {/* 重置 */}
        <button
          type="button"
          onClick={onReset}
          className="rounded-md p-2 hover:bg-muted transition-colors"
          title="重置"
          aria-label="重置"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        {/* 播放 / 暂停 */}
        <button
          type="button"
          onClick={isPlaying ? onPause : onPlay}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-4 py-2 font-medium text-sm transition-colors',
            isPlaying
              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
          title={isPlaying ? '暂停' : isFinished ? '重新播放' : '播放'}
          aria-label={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? (
            <>
              <Pause className="h-4 w-4" /> 暂停
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> {isFinished ? '重播' : '播放'}
            </>
          )}
        </button>

        {/* 单步前进（更精细的控制） */}
        <button
          type="button"
          onClick={() => onStep(1)}
          disabled={current >= total - 1}
          className="rounded-md p-2 hover:bg-muted disabled:opacity-40 transition-colors"
          title="前进一步"
          aria-label="前进一步"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* 跳转到结尾 */}
        <button
          type="button"
          onClick={() => onStep(total - 1 - current)}
          disabled={current >= total - 1}
          className="rounded-md p-2 hover:bg-muted disabled:opacity-40 transition-colors"
          title="跳转到结尾"
          aria-label="跳转到结尾"
        >
          <SkipForward className="h-4 w-4" />
        </button>

        {/* 速度选择 */}
        <div className="ml-2 flex items-center gap-1 rounded-md border px-1 py-0.5">
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSpeedChange(opt.value)}
              className={cn(
                'rounded px-2 py-0.5 text-xs transition-colors',
                speed === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
