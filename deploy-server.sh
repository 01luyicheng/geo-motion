#!/bin/bash

set -e

echo "=========================================="
echo "   GeoMotion 生产环境部署脚本"
echo "=========================================="
echo ""

PROJECT_DIR="/root/geo-motion"
FRONTEND_DIR="$PROJECT_DIR/frontend"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "[1/6] 克隆项目..."
    cd /root
    git clone https://github.com/01luyicheng/geo-motion.git
else
    echo "[1/6] 更新项目代码..."
    cd "$PROJECT_DIR"
    git pull origin main
fi

echo ""
echo "[2/6] 创建环境变量文件..."
cd "$FRONTEND_DIR"
if [ ! -f .env.local ]; then
    cat > .env.local << 'ENVEOF'
OPENROUTER_API_KEY=sk-or-v1-your-api-key-here
OPENROUTER_MODEL=qwen/qwen3-vl-235b-a22b-instruct
NEXT_PUBLIC_BASE_URL=https://geomotion.luyicheng.me
ENVEOF
    echo "✓ 已创建 .env.local 文件"
    echo ""
    echo "=========================================="
    echo "   重要：请配置 API Key"
    echo "=========================================="
    echo "请编辑 $FRONTEND_DIR/.env.local 文件"
    echo "将 OPENROUTER_API_KEY 设置为你的实际 API Key"
    echo ""
    read -p "配置完成后按回车继续..."
else
    echo "✓ .env.local 已存在"
fi

echo ""
echo "[3/6] 安装依赖..."
cd "$FRONTEND_DIR"
npm install

echo ""
echo "[4/6] 构建项目..."
npm run build

echo ""
echo "[5/6] 停止旧进程..."
pm2 stop geo-motion 2>/dev/null || true
pm2 delete geo-motion 2>/dev/null || true

echo ""
echo "[6/6] 启动应用..."
cd "$PROJECT_DIR"
pm2 start ecosystem.config.js

echo ""
echo "=========================================="
echo "   部署完成！"
echo "=========================================="
echo ""
echo "应用已启动，访问: https://geomotion.luyicheng.me"
echo ""
echo "常用命令："
echo "  查看日志: pm2 logs geo-motion"
echo "  重启应用: pm2 restart geo-motion"
echo "  停止应用: pm2 stop geo-motion"
echo "  查看状态: pm2 status"
echo ""
