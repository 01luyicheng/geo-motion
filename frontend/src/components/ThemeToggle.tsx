'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

function getAppliedTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [applied, setApplied] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    setApplied(getAppliedTheme());
  }, []);

  const toggle = () => {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setApplied('light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setApplied('dark');
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      title={applied === 'dark' ? '切换至亮色模式' : '切换至暗色模式'}
      aria-label="切换主题"
    >
      {applied === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}
