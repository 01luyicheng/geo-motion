# GeoMotion 生产环境部署指南

## 前置要求

- Node.js 18+ 
- npm 或 yarn
- PM2 (进程管理器)
- Nginx (反向代理)
- 域名已解析到服务器IP
- Cloudflare 已配置代理

## 快速部署

### 方法一：使用自动部署脚本

1. SSH 登录到服务器
2. 下载并运行部署脚本：

```bash
cd /root
wget https://raw.githubusercontent.com/01luyicheng/geo-motion/main/deploy-server.sh
chmod +x deploy-server.sh
./deploy-server.sh
```

3. 按提示配置 API Key

### 方法二：手动部署

#### 1. 克隆项目

```bash
cd /root
git clone https://github.com/01luyicheng/geo-motion.git
cd geo-motion
```

#### 2. 配置环境变量

```bash
cd frontend
cp .env.local.example .env.local
nano .env.local
```

编辑 `.env.local` 文件：

```env
OPENROUTER_API_KEY=你的实际API密钥
OPENROUTER_MODEL=qwen/qwen3-vl-235b-a22b-instruct
NEXT_PUBLIC_BASE_URL=https://geomotion.luyicheng.me
```

#### 3. 安装依赖并构建

```bash
npm install
npm run build
```

#### 4. 使用 PM2 启动

```bash
cd /root/geo-motion
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### 5. 配置 Nginx

```bash
sudo nano /etc/nginx/sites-available/geomotion
```

粘贴以下配置：

```nginx
server {
    listen 80;
    server_name geomotion.luyicheng.me;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/geomotion /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 6. 配置 SSL (可选，如果使用 Cloudflare 代理)

如果使用 Cloudflare 代理，SSL 已由 Cloudflare 处理。如果需要直接 SSL：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d geomotion.luyicheng.me
```

## 分享功能配置

分享功能需要确保：

1. **环境变量正确**：`NEXT_PUBLIC_BASE_URL` 必须设置为你的域名
2. **API Key 配置**：OpenRouter API Key 必须有效
3. **Cloudflare 设置**：
   - 确保 Cloudflare 的 SSL/TLS 模式设置为 "Full" 或 "Flexible"
   - 检查防火墙规则是否阻止了必要的请求

## 常用命令

```bash
# 查看应用状态
pm2 status

# 查看日志
pm2 logs geo-motion

# 重启应用
pm2 restart geo-motion

# 停止应用
pm2 stop geo-motion

# 更新部署
cd /root/geo-motion
git pull
cd frontend
npm install
npm run build
pm2 restart geo-motion
```

## 故障排查

### 1. 应用无法访问

检查 PM2 状态：
```bash
pm2 status
pm2 logs geo-motion
```

检查端口占用：
```bash
netstat -tulpn | grep 3000
```

### 2. 分享功能不工作

检查环境变量：
```bash
cd /root/geo-motion/frontend
cat .env.local
```

确保 `NEXT_PUBLIC_BASE_URL` 设置正确。

### 3. API 调用失败

检查 API Key 是否有效：
```bash
curl -X POST https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen/qwen3-vl-235b-a22b-instruct","messages":[{"role":"user","content":"test"}]}'
```

## Cloudflare 配置建议

1. **SSL/TLS**: 设置为 "Full" 模式
2. **Speed**: 启用 Auto Minify
3. **Caching**: 设置适当的缓存规则
4. **Security**: 考虑启用 WAF 规则

## 监控和维护

### 设置日志轮转

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 设置自动重启

PM2 配置文件已包含自动重启选项。如需修改：

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'geo-motion',
    script: 'npm',
    args: 'start',
    cwd: '/root/geo-motion/frontend',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
```
