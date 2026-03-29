# 环境变量配置指南

> 如何安全地配置 API Key 和其他环境变量

---

## ⚠️ 重要安全提示

**永远不要将真实的 API Key 提交到 GitHub！**

- ✅ `.env.example` - 可以提交到 GitHub（示例文件，不含真实密钥）
- ❌ `.env.local` - **绝对不能提交**（包含真实密钥）
- ✅ `.gitignore` 已配置为忽略 `.env.local` 文件

---

## 本地开发环境配置

### 1. 创建本地环境文件

```powershell
# 进入前端目录
cd frontend

# 复制示例文件
copy .env.local.example .env.local
```

### 2. 填入你的 API Key

编辑 `.env.local` 文件：

```env
# 填入你从 OpenRouter 获取的真实 API Key
OPENROUTER_API_KEY=sk-or-v1-你的真实密钥
```

### 3. 验证配置

```powershell
npm run dev
```

如果看到 "OPENROUTER_API_KEY 环境变量未设置" 错误，说明配置未生效。

---

## 获取 OpenRouter API Key

1. 访问 https://openrouter.ai/keys
2. 注册/登录账号
3. 点击 "Create Key" 创建新密钥
4. 复制密钥并保存到 `.env.local`

---

## 团队密钥分发方式

### 方式一：私下分享（推荐小团队）

1. **不要**在 GitHub、微信、邮件等渠道发送密钥
2. 使用安全的即时通讯工具（如飞书、钉钉）私聊发送
3. 接收方收到后立即删除聊天记录

### 方式二：使用密码管理器（推荐）

使用团队密码管理器共享：
- 1Password
- Bitwarden
- LastPass Enterprise

### 方式三：GitHub Secrets（CI/CD 使用）

如果是 GitHub Actions 需要密钥：

1. 进入 GitHub 仓库 → Settings → Secrets and variables → Actions
2. 点击 "New repository secret"
3. 添加 `OPENROUTER_API_KEY`

---

## 检查清单

### 提交代码前检查

- [ ] 确认 `.env.local` 不在提交列表中（`git status` 不显示）
- [ ] 确认没有硬编码的 API Key 在代码中
- [ ] 确认只提交了 `.env.local.example` 示例文件

### 如果不小心提交了密钥

**立即执行以下操作：**

1. **撤销提交**（如果还未推送）：
   ```powershell
   git reset HEAD~1
   ```

2. **如果已推送到 GitHub**：
   - 立即在 OpenRouter 删除该密钥
   - 创建新的 API Key
   - 使用工具（如 BFG Repo-Cleaner）清理 Git 历史
   - 强制推送清理后的仓库：`git push --force`

3. **通知团队成员**：
   - 告知密钥已泄露
   - 分发新的 API Key

---

## 常见问题

### Q: 为什么 `process.env.OPENROUTER_API_KEY` 是 undefined？

A: 检查以下几点：
1. 文件是否命名为 `.env.local`（不是 `.env`）
2. 文件是否在 `frontend/` 目录下
3. 是否重启了开发服务器
4. 变量名是否拼写正确

### Q: 可以为每个团队成员分配不同的 API Key 吗？

A: 可以，推荐这样做：
- 每个成员使用自己的 OpenRouter 账号
- 各自创建自己的 API Key
- 这样便于追踪使用量和成本控制

### Q: 如何限制 API Key 的使用？

A: 在 OpenRouter 控制台可以：
- 设置使用限额
- 限制可访问的模型
- 查看使用统计

---

## 安全最佳实践

1. **定期轮换密钥** - 每 3-6 个月更换一次
2. **最小权限原则** - 只给必要的权限
3. **监控使用量** - 定期检查是否有异常调用
4. **使用环境变量** - 永远不要在代码中硬编码密钥
5. **区分环境** - 开发、测试、生产使用不同的密钥
