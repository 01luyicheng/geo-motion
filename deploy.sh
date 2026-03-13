#!/bin/bash

# GeoMotion 自动部署脚本
# 支持 Linux/macOS/WSL

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "=========================================="
echo "   GeoMotion 自动部署脚本"
echo "=========================================="
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查 Node.js
echo -e "${BLUE}[1/4]${NC} 检查 Node.js 环境..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}[错误]${NC} 未检测到 Node.js，请先安装 Node.js 18+"
    echo "下载地址: https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}[错误]${NC} Node.js 版本过低，需要 18+，当前版本: $(node -v)"
    exit 1
fi
echo -e "${GREEN}[✓]${NC} Node.js 已安装: $(node -v)"
echo ""

# 检查 npm
echo -e "${BLUE}[2/4]${NC} 检查 npm..."
if ! command -v npm &> /dev/null; then
    echo -e "${RED}[错误]${NC} 未检测到 npm"
    exit 1
fi
echo -e "${GREEN}[✓]${NC} npm 已安装: $(npm -v)"
echo ""

# 进入前端目录
cd "$SCRIPT_DIR/frontend"

# 安装依赖
echo -e "${BLUE}[3/4]${NC} 安装项目依赖..."
echo "这可能需要几分钟，请耐心等待..."
if ! npm install; then
    echo -e "${RED}[错误]${NC} 依赖安装失败"
    exit 1
fi
echo -e "${GREEN}[✓]${NC} 依赖安装完成"
echo ""

# 配置环境变量
echo -e "${BLUE}[4/4]${NC} 配置环境变量..."
if [ ! -f .env.local ]; then
    cp .env.local.example .env.local
    echo -e "${GREEN}[✓]${NC} 已创建 .env.local 文件"
    echo ""
    echo "=========================================="
    echo "   重要：请配置 API Key"
    echo "=========================================="
    echo ""
    echo "请按以下步骤操作："
    echo "1. 访问 https://openrouter.ai/keys 获取 API Key"
    echo "2. 编辑 frontend/.env.local 文件"
    echo "3. 将 OPENROUTER_API_KEY=sk-or-v1-your-api-key-here"
    echo "   替换为你的实际 API Key"
    echo "4. 保存文件"
    echo ""
    read -p "配置完成后，按回车键继续启动..."
else
    echo -e "${GREEN}[✓]${NC} .env.local 文件已存在"
    
    # 检查是否已配置 API Key
    if grep -q "sk-or-v1-your-api-key-here" .env.local; then
        echo -e "${YELLOW}[警告]${NC} 检测到默认 API Key 未修改"
        echo "请编辑 .env.local 文件，填入你的实际 API Key"
        read -p "按回车键继续（可能无法正常使用）..."
    fi
fi
echo ""

# 启动开发服务器
echo "=========================================="
echo "   启动 GeoMotion 开发服务器"
echo "=========================================="
echo ""
echo -e "启动后请访问: ${GREEN}http://localhost:3000${NC}"
echo "按 Ctrl+C 停止服务器"
echo ""
read -p "按回车键启动..."
npm run dev
