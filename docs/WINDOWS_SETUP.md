# Windows 开发环境配置指南

> 面向新团队成员的完整 Windows 环境配置和代码更新指南

---

## 一、首次环境配置（新成员）

### 1. 安装 Git

1. 下载 Git for Windows：https://git-scm.com/download/win
2. 安装时选择：
   - **Use Git from Git Bash only** (推荐) 或 **Git from the command line and also from 3rd-party software**
   - **Checkout Windows-style, commit Unix-style line endings**
3. 验证安装：
   ```powershell
   git --version
   ```

### 2. 配置 Git 用户信息

```powershell
# 设置用户名（替换为你的名字）
git config --global user.name "你的名字"

# 设置邮箱（替换为你的邮箱）
git config --global user.email "your.email@example.com"

# 验证配置
git config --list
```

### 3. 从仓库克隆代码

```powershell
# 克隆项目
git clone https://github.com/01luyicheng/geo-motion.git
cd geo-motion
```

### 4. 安装 Node.js 24

#### 方式一：使用 nvm-windows（推荐）

1. 下载 nvm-windows：https://github.com/coreybutler/nvm-windows/releases
   - 下载 `nvm-setup.exe` 并安装

2. 安装 Node.js 24：
   ```powershell
   nvm install 24
   nvm use 24
   ```

3. 验证安装：
   ```powershell
   node -v  # 应显示 v24.x.x
   npm -v   # 应显示 10.x.x
   ```

#### 方式二：直接下载安装

1. 下载 Node.js 24 LTS：https://nodejs.org/
2. 运行安装程序，一路下一步
3. 验证：
   ```powershell
   node -v
   npm -v
   ```

### 5. 安装 VS Code（推荐编辑器）

1. 下载：https://code.visualstudio.com/
2. 安装推荐插件：
   - ESLint
   - Prettier
   - Tailwind CSS IntelliSense
   - TypeScript Importer
   - GitHub Copilot（如有权限）

### 6. 安装依赖并启动

```powershell
cd frontend
npm install
npm run dev
```

访问 http://localhost:3000 查看应用

---

## 二、日常开发工作流

### 开发前准备

```powershell
# 1. 进入项目目录
cd geo-motion

# 2. 确保在 main 分支且代码最新
git checkout main
git pull origin main

# 3. 创建新分支（分支名要描述清楚功能）
git checkout -b feature/你的功能名称
# 或
git checkout -b fix/修复的问题
```

### 开发过程中

```powershell
# 查看修改了哪些文件
git status

# 查看具体修改内容
git diff

# 添加修改的文件到暂存区
git add 文件名
# 或添加所有修改
git add .

# 提交修改（写清楚的提交信息）
git commit -m "feat: 添加某某功能"
# 或
git commit -m "fix: 修复某某问题"
```

**提交信息规范：**
- `feat:` 新功能
- `fix:` 修复问题
- `docs:` 文档更新
- `style:` 代码格式调整
- `refactor:` 代码重构
- `test:` 测试相关
- `chore:` 构建/工具相关

### 提交 PR（Pull Request）

#### 方式一：使用 GitHub CLI（推荐）

1. **安装 GitHub CLI**：
   ```powershell
   # 使用 winget 安装
   winget install --id GitHub.cli

   # 验证安装
   gh --version
   ```

2. **登录 GitHub**：
   ```powershell
   gh auth login
   # 按提示选择：HTTPS -> 通过浏览器登录
   ```

3. **推送分支并创建 PR**：
   ```powershell
   # 推送当前分支到远程
   git push origin 你的分支名

   # 创建 PR
   gh pr create --title "PR标题" --body "PR描述"

   # 或交互式创建（会提示输入信息）
   gh pr create
   ```

#### 方式二：使用 Git 命令 + 网页

```powershell
# 1. 推送分支到远程仓库
git push origin 你的分支名

# 2. 打开浏览器访问：
# https://github.com/01luyicheng/geo-motion/pulls
# 点击 "New Pull Request" 按钮创建
```

### 代码审查和合并

```powershell
# 查看 PR 列表
gh pr list

# 查看某个 PR 详情
gh pr view PR编号

# 在浏览器中打开 PR
gh pr view --web
```

**PR 合并前检查清单：**
- [ ] 代码能正常运行
- [ ] 没有明显的错误
- [ ] 提交信息清晰
- [ ] 通过了 CI 检查（如有）

---

## 三、代码更新（已从仓库拉取旧代码的成员）

如果你之前已经从仓库拉取过代码，需要更新到最新版本：

### 步骤 1：进入项目目录

```powershell
cd geo-motion
```

### 步骤 2：保存当前工作（如有未提交更改）

```powershell
# 查看当前状态
git status

# 如有未提交更改，先暂存
git stash
```

### 步骤 3：从仓库拉取最新代码

```powershell
# 从远程仓库拉取最新代码
git pull origin main
```

### 步骤 4：更新 Node.js 版本

```powershell
# 如果使用 nvm
nvm install 24
nvm use 24

# 验证版本
node -v  # 应显示 v24.x.x
```

### 步骤 5：进入前端目录并重新安装依赖

```powershell
cd frontend

# 删除旧依赖（可选，但推荐）
rm -rf node_modules
rm package-lock.json

# 重新安装依赖
npm install
```

### 步骤 6：恢复之前的工作（如执行了 stash）

```powershell
git stash pop
```

### 步骤 7：启动开发服务器

```powershell
npm run dev
```

访问 http://localhost:3000 查看应用

---

## 四、常见问题

### Q1: `git pull` 提示冲突怎么办？

```powershell
# 查看冲突文件
git status

# 手动解决冲突后，标记为已解决
git add <冲突文件>
git commit -m "解决合并冲突"
```

### Q2: `npm install` 报错权限不足？

**以管理员身份运行 PowerShell**，然后重试。

### Q3: nvm 命令找不到？

1. 关闭并重新打开 PowerShell
2. 检查环境变量是否配置正确
3. 或尝试重启电脑

### Q4: 提示 Node.js 版本不符合要求？

```powershell
# 检查当前版本
node -v

# 如果不是 24.x.x，切换版本
nvm use 24

# 如果未安装 24
nvm install 24
nvm use 24
```

### Q5: 端口 3000 被占用？

```powershell
# 查找占用 3000 端口的进程
netstat -ano | findstr :3000

# 结束进程（将 <PID> 替换为实际的进程 ID）
taskkill /PID <PID> /F
```

### Q6: GitHub CLI 登录失败？

```powershell
# 检查是否已登录
gh auth status

# 如未登录，重新登录
gh auth login

# 或退出后重新登录
gh auth logout
gh auth login
```

### Q7: 推送代码时提示权限不足？

确保你已被添加为仓库的协作者。联系仓库所有者添加你的 GitHub 账号。

---

## 五、快速检查清单

### 新成员首次配置

- [ ] Git 已安装 (`git --version`)
- [ ] Git 用户信息已配置 (`git config --list`)
- [ ] 代码已从仓库克隆
- [ ] Node.js 24 已安装 (`node -v` 显示 v24.x.x)
- [ ] 依赖已安装 (`npm install` 无报错)
- [ ] 开发服务器能正常启动 (`npm run dev`)
- [ ] 浏览器能访问 http://localhost:3000

### 每次开发前

- [ ] 已切换到 main 分支并拉取最新代码
- [ ] 已创建功能分支
- [ ] 开发环境能正常启动

### 提交 PR 前

- [ ] 代码能正常运行
- [ ] 已提交所有修改（`git status` 无未提交文件）
- [ ] 已推送到远程分支
- [ ] PR 描述清晰说明了改动内容

---

## 六、使用 nvm 管理多版本（进阶）

```powershell
# 查看已安装的版本
nvm list

# 安装新版本
nvm install 22

# 切换版本
nvm use 22

# 设置默认版本
nvm alias default 24

# 卸载旧版本
nvm uninstall 18
```

---

## 七、GitHub CLI 常用命令

```powershell
# 查看帮助
gh --help

# PR 相关
gh pr create          # 创建 PR
gh pr list            # 查看 PR 列表
gh pr view            # 查看 PR 详情
gh pr checkout 123    # 切换到 PR #123 的分支
gh pr merge           # 合并 PR

# Issue 相关
gh issue create       # 创建 Issue
gh issue list         # 查看 Issue 列表

# 仓库相关
gh repo view          # 查看仓库信息
gh repo fork          # Fork 仓库
```

---

## 八、项目目录结构

```
geo-motion/
├── .github/              # GitHub 配置
│   └── workflows/        # CI/CD 工作流
├── docs/                 # 文档
│   ├── WINDOWS_SETUP.md  # 本文件
│   ├── SPEC.md
│   └── ...
├── frontend/             # 前端代码
│   ├── src/
│   ├── package.json
│   └── ...
├── .nvmrc               # Node.js 版本指定 (24)
└── README.md
```

---

## 九、获取帮助

遇到问题？

1. 查看 [README.md](../README.md) 基础文档
2. 查看 [ARCHITECTURE.md](./ARCHITECTURE.md) 架构文档
3. 在团队群聊中提问
4. 查看 [GitHub Issues](https://github.com/01luyicheng/geo-motion/issues)
