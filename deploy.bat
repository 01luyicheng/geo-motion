@echo off
chcp 65001 >nul
title GeoMotion 自动部署脚本
echo.
echo ==========================================
echo    GeoMotion 自动部署脚本
echo ==========================================
echo.

:: 检查 Node.js
echo [1/4] 检查 Node.js 环境...
node -v >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
echo [✓] Node.js 已安装
node -v
echo.

:: 检查 npm
echo [2/4] 检查 npm...
npm -v >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 npm
    pause
    exit /b 1
)
echo [✓] npm 已安装
npm -v
echo.

:: 进入前端目录
cd /d "%~dp0frontend"

:: 安装依赖
echo [3/4] 安装项目依赖...
echo 这可能需要几分钟，请耐心等待...
npm install
if errorlevel 1 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)
echo [✓] 依赖安装完成
echo.

:: 配置环境变量
echo [4/4] 配置环境变量...
if not exist .env.local (
    copy .env.local.example .env.local
    echo [✓] 已创建 .env.local 文件
    echo.
    echo ==========================================
    echo    重要：请配置 API Key
    echo ==========================================
    echo.
    echo 请按以下步骤操作：
    echo 1. 访问 https://openrouter.ai/keys 获取 API Key
    echo 2. 用文本编辑器打开 frontend\.env.local 文件
    echo 3. 将 OPENROUTER_API_KEY=sk-or-v1-your-api-key-here
    echo    替换为你的实际 API Key
    echo 4. 保存文件
    echo.
    echo 配置完成后，按任意键继续启动...
    pause >nul
) else (
    echo [✓] .env.local 文件已存在
)
echo.

:: 启动开发服务器
echo ==========================================
echo    启动 GeoMotion 开发服务器
echo ==========================================
echo.
echo 启动后请访问: http://localhost:3000
echo 按 Ctrl+C 停止服务器
echo.
pause
npm run dev
