<div align="center">

# git-arena 前端

**一个把 Git 提交图、真实命令行和协作练习放在同一个工作台里的学习平台。**

<p>
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3.5-4FC08D?style=flat-square&logo=vuedotjs&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Ant Design Vue" src="https://img.shields.io/badge/Ant%20Design%20Vue-4.2-0170FE?style=flat-square&logo=antdesign&logoColor=white">
  <img alt="D3.js" src="https://img.shields.io/badge/D3.js-7.9-F9A03C?style=flat-square&logo=d3dotjs&logoColor=white">
  <img alt="xterm.js" src="https://img.shields.io/badge/xterm.js-6-2E3A46?style=flat-square&logo=gnometerminal&logoColor=white">
</p>

</div>

## 项目介绍

git-arena 是一个面向 Git 学习和协作训练的交互式 Web 应用。它把真实 Git 操作拆解成可以观察、练习和复盘的过程：

- 在提交图中观察 commit、分支、标签、HEAD 和远程跟踪分支的变化。
- 在终端中输入真实的 Git 命令，也可以使用图形化操作面板完成常用操作。
- 通过关卡练习提交、分支、合并、变基、冲突、远程仓库和 Pull Request。
- 在协作房间中与其他成员使用各自的克隆仓库，共同操作一个共享 origin。

前端负责展示界面、接收输入和呈现后端返回的仓库状态；Git 命令由后端沙盒执行。

## 主要功能

### 工作台

工作台是默认首页，包含三个区域：

- 提交图：以 DAG 形式展示当前仓库历史和引用关系。
- 命令终端：支持命令输入、历史记录、中文输入、退格、复制粘贴和错误提示。
- 操作面板：用按钮完成初始化、提交、创建分支、切换、合并、变基等常用操作。

终端和操作面板会调用同一套后端命令接口，因此两种操作看到的是同一个仓库状态。

### 关卡地图

关卡地图按学习主题组织官方关卡，支持查看难度、完成状态、关卡说明和目标图。当前覆盖：

- 基础操作：init、add、commit、log、tag、相对提交引用等。
- 分支：创建、切换和分叉历史。
- 合并：快进合并、三方合并、压缩合并和冲突处理。
- 变基：普通变基和变基冲突解决。
- 远程：fetch、pull、push 和推送被拒绝的处理。
- 协作与 PR：多人房间、远程同步、PR 创建、评审和合并。

### 协作房间

进入“协作房间”后，可以创建房间或使用邀请码加入房间。房间页面提供：

- 当前成员和在线状态。
- “我的克隆”与共享 origin 的双提交图。
- 成员终端和 Git 操作面板。
- Pull Request 创建、评审、行级评论和合并。
- 协作场景关卡的目标校验。

### 关卡编辑器

登录后可以在“关卡编辑器”中创建和编辑自定义关卡，包括：

- 初始提交图、分支和工作区。
- 目标图与校验条件。
- 参考解步骤。
- 分级提示。

## 页面入口

| 页面 | 地址 | 用途 |
|---|---|---|
| 工作台 | `/` | 自由沙盒、提交图、终端和操作面板 |
| 协作房间 | `/rooms` | 创建或加入多人 Git 协作房间 |
| 关卡编辑器 | `/level-editor` | 创建、编辑和发布自定义关卡 |
| 登录 / 注册 | `/login` | 登录、注册或升级游客账号 |

## 环境要求

- Node.js 20.15.0 或更高版本
- npm
- 正常运行的 git-arena 后端服务

开发服务器默认运行在 `http://localhost:5173`，并将 `/api` 请求代理到 `http://localhost:8096`。如果后端没有启动，页面仍可以打开，但会话、关卡和协作数据无法加载。

## 快速开始

在前端目录执行：

```bash
npm install
npm run dev
```

然后打开：

```text
http://localhost:5173
```

如果需要同时启动后端，可以在另一个终端进入后端模块目录：

```bash
cd ../git-arena
mvn spring-boot:run
```

首次启动后端前，请确保后端所需的 PostgreSQL 和其他服务已按项目环境配置启动。

## 常用命令

```bash
# 安装依赖
npm install

# 启动开发服务器，支持热更新
npm run dev

# 类型检查并构建生产版本
npm run build

# 仅执行类型检查
npm run type-check

# 预览生产构建结果
npm run preview
```

## 使用流程

### 开始一次自由练习

1. 打开工作台首页。
2. 等待沙盒会话创建完成。
3. 在终端输入命令，例如：

   ```text
   git init
   touch README.txt
   git add README.txt
   git commit -m "first commit"
   git log
   ```

4. 在提交图中观察提交节点和 `HEAD` 的变化。

### 开始一张关卡

1. 在工作台点击“关卡地图”。
2. 选择一张未完成的关卡。
3. 阅读关卡说明和目标图。
4. 使用终端或操作面板完成目标。
5. 达到目标后，系统会自动校验并记录进度。

### 练习多人协作

1. 打开“协作房间”。
2. 创建房间并复制邀请码，或输入队友的邀请码加入。
3. 在自己的克隆中创建分支并提交修改。
4. 使用 `git push` 将分支推送到共享 origin。
5. 创建 Pull Request，邀请房间成员评审。
6. 解决反馈或冲突后，再由房主合并 PR。

## 项目结构

```text
src/
├─ api/                 # 后端接口封装
├─ assets/              # 图片和静态资源
├─ components/
│  ├─ auth/             # 用户菜单和认证相关组件
│  ├─ collab/           # 协作房间和 PR 评审组件
│  ├─ editor/           # 关卡编辑器组件
│  ├─ engagement/       # 积分、成就和成长中心
│  ├─ graph/            # D3 提交图组件
│  ├─ level/            # 关卡选择、目标图和提示组件
│  ├─ panel/            # Git 操作面板
│  └─ terminal/         # xterm.js 终端组件
├─ router/              # 页面路由
├─ stores/              # Pinia 状态管理
├─ types/               # TypeScript 类型定义
└─ views/               # 页面级组件
```

## 技术栈

| 领域 | 技术 |
|---|---|
| 前端框架 | Vue 3 + Composition API |
| 编程语言 | TypeScript |
| 构建工具 | Vite 6 |
| 状态管理 | Pinia |
| 路由 | Vue Router |
| UI 组件 | Ant Design Vue |
| 提交图 | D3.js |
| 终端 | xterm.js |
| HTTP 请求 | Axios |
| 协作通信 | STOMP + SockJS |

## 常见问题

### 页面打开了，但一直显示会话创建失败

确认后端是否运行在 `8096` 端口，并检查浏览器开发者工具中的 `/api` 请求是否能够返回。

### 协作房间无法连接或成员状态不刷新

协作房间除了 REST 接口，还需要 WebSocket 代理正常工作。开发环境下 Vite 已配置 `/ws` 代理到后端 `8096` 端口。

### 登录后仍然看不到进度

确认浏览器没有禁用本地存储，并重新刷新页面。游客可以体验功能，但登录后才能保存关卡进度、积分和成就。

## 相关模块

- 后端模块：[`../git-arena`](../git-arena)
- 项目根目录：[`..`](..)
