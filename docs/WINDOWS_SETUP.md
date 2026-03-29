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

### 2. 从仓库克隆代码

```powershell
# 克隆项目
git clone https://github.com/01luyicheng/geo-motion.git
cd geo-motion
```

### 3. 安装 Node.js 24

1. 下载 Git for Windows：https://git-scm.com/download/win
2. 安装时选择：
   - **Use Git from Git Bash only** (推荐) 或 **Git from the command line and also from 3rd-party software**
   - **Checkout Windows-style, commit Unix-style line endings**
3. 验证安装：
   ```powershell
   git --version
   ```

### 2. 安装 Node.js 24

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

### 3. 安装 VS Code（推荐编辑器）

1. 下载：https://code.visualstudio.com/
2. 安装推荐插件：
   - ESLint
   - Prettier
   - Tailwind CSS IntelliSense
   - TypeScript Importer

---

## 二、代码更新（已从仓库拉取旧代码的成员）

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

### 步骤 3：更新 Node.js 版本

```powershell
# 如果使用 nvm
nvm install 24
nvm use 24

# 验证版本
node -v  # 应显示 v24.x.x
```

### 步骤 4：进入前端目录并重新安装依赖

```powershell
cd frontend

# 删除旧依赖（可选，但推荐）
rm -rf node_modules
rm package-lock.json

# 重新安装依赖
npm install
```

### 步骤 5：恢复之前的工作（如执行了 stash）

```powershell
git stash pop
```

### 步骤 6：启动开发服务器

```powershell
npm run dev
```

访问 http://localhost:3000 查看应用

---

## 三、常见问题

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

---

## 四、快速检查清单

新成员配置完成后，请确认：

- [ ] Git 已安装 (`git --version`)
- [ ] Node.js 24 已安装 (`node -v` 显示 v24.x.x)
- [ ] 代码已克隆/更新 (`git pull origin main`)
- [ ] 依赖已安装 (`npm install` 无报错)
- [ ] 开发服务器能正常启动 (`npm run dev`)
- [ ] 浏览器能访问 http://localhost:3000

---

## 五、使用 nvm 管理多版本（进阶）

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

## 六、项目目录结构

```
geo-motion/
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

## 七、获取帮助

遇到问题？

1. 查看 [README.md](../README.md) 基础文档
2. 查看 [ARCHITECTURE.md](./ARCHITECTURE.md) 架构文档
3. 在团队群聊中提问
