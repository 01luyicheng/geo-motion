import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GeoMotion — 几何题可视化教学工具',
  description: '通过 AI 将几何题目转换为可交互的 GeoGebra 演示图形，助力教学',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
          <div className="container mx-auto flex h-14 items-center px-4">
            <a href="/" className="flex items-center gap-2 font-semibold text-primary">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
              <span>GeoMotion</span>
            </a>
            <nav className="ml-auto flex items-center gap-4 text-sm text-muted-foreground">
              <a href="/" className="hover:text-foreground transition-colors">
                分析几何题
              </a>
              <a href="/?mode=generate" className="hover:text-foreground transition-colors">
                草图转精确图
              </a>
            </nav>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="border-t bg-white/50 py-4 text-center text-xs text-muted-foreground">
          GeoMotion · 基于 AI + GeoGebra 的几何教学工具
        </footer>
      </body>
    </html>
  );
}
