# git-arena-frontend

git-arena 的前端。**图形化 DAG 视图 + 真实命令行终端共存**，让使用者直观看到每一条 git 命令如何改变提交图，进而看懂版本控制、练会多人协作。

> 本模块是 git-arena 的前端子项目。项目整体愿景、架构与契约以仓库根目录 [`CLAUDE.md`](../CLAUDE.md) 为准，本文只讲前端。

## 核心理念

图形操作与命令行操作**走同一条执行链路、共用同一份状态模型**。终端敲 `git commit` 与点击面板按钮，最终都汇入 [`WorkbenchView`](src/views/WorkbenchView.vue) 的 `execute`，经 Pinia store 的 `exec` 调同一后端接口，再用后端返回的新快照刷新图与终端。**绝不允许图视图和终端各自维护状态**（`CLAUDE.md` §3 黄金法则）。

前端只持有后端返回的**只读快照**（GitGraph JSON，见 `CLAUDE.md` §5），不在本地"预测"仓库变化——一切以后端执行结果为准。

## 技术栈

| 用途 | 选型 |
|---|---|
| 框架 | Vue 3（Composition API + `<script setup lang="ts">`） |
| 构建 | Vite 6.x（锁定，勿升级到 7/8——受开发机 Node 20.15.0 约束） |
| 语言 | TypeScript（强制） |
| 状态 | Pinia |
| 路由 | Vue Router |
| 通用 UI | Ant Design Vue（应用外壳唯一来源，按需引入，禁止第二个组件库） |
| 图可视化 | D3.js（自绘 commit DAG，确定性布局） |
| 终端 | xterm.js（`@xterm/xterm` + `addon-fit`） |
| HTTP | Axios（经 `api/` 封装层统一调用） |

## 环境要求

- Node.js **20.15.0**（开发机锁定版本；`package.json` 也允许 22 / 24，但本项目以 20.15.0 为准）
- 后端服务运行在 `http://localhost:8096`（Vite 已将 `/api` 代理到此，前端走同源免跨域）

## 快速开始

```sh
npm install       # 安装依赖
npm run dev       # 启动开发服务器（http://localhost:5173）
```

启动后打开工作台，会自动创建沙盒会话。可在终端试跑 M1 全链路：

```sh
git init → touch a.txt → git add . → git commit -m "init" → git log
```

## 常用脚本

```sh
npm run dev          # 开发服务器 + 热更新（端口 5173）
npm run build        # 生产构建（先 type-check 再 vite build）
npm run type-check   # 仅类型检查（vue-tsc）
npm run preview      # 本地预览构建产物
```

> 提交前请确保 `npm run type-check` 通过（`CLAUDE.md` §8 自检清单）。

## 目录结构

```
src/
  api/            # Axios 封装，一个后端资源一个文件
    http.ts       #   请求实例与拦截器
    sandbox.ts    #   会话/沙盒接口（创建、重置、读图）
    command.ts    #   命令执行接口（终端与面板共用）
  components/
    graph/        # commit DAG 可视化（D3 自绘）
      layout.ts   #   确定性布局：纯函数 GitGraph → 坐标
      GitGraphView.vue
    terminal/     # xterm.js 终端封装
    panel/        # 图形化操作按钮面板
  stores/
    session.ts    # 会话与图状态（唯一 GitGraph 快照来源）
  types/
    gitGraph.ts   # GitGraph 契约类型（§5 的唯一前端来源）
  views/
    WorkbenchView.vue   # 工作台：图 + 终端 + 面板并存，命令唯一编排点
  router/
```

## 开发约定（硬性）

以下摘自 `CLAUDE.md` §6，改动前请通读该章：

- 一律 `<script setup lang="ts">` + Composition API，不写 Options API。
- GitGraph 类型只在 [`types/gitGraph.ts`](src/types/gitGraph.ts) 定义，禁止在组件里散落重复定义。
- 组件命名 PascalCase 多词（`GitGraphView.vue`，不要 `Graph.vue`）。
- 业务逻辑抽到 composables；业务状态入 Pinia，禁止全局变量或 provide/inject 传业务状态。
- 与后端交互一律走 `api/` 封装层，组件内不直接写 axios URL。
- **面板动作必须转成与命令行等价的命令请求，走同一 API**（黄金法则）。
- 通用 UI 一律用 Ant Design Vue（按需引入）；但 **DAG 与终端两个教学核心区不归 antd 管**——DAG 由 D3 自绘、终端由 xterm.js 承载，不要用 antd 包裹其内部渲染。
- 主题定制统一走 `ConfigProvider` 的 design token，禁止散落覆盖 `.ant-*` 类名。

### 图可视化约束（`CLAUDE.md` §6.3）

- **布局必须是纯函数**：同一份 GitGraph JSON 永远产出同一张图；**禁止力导向布局**（位置需可复现，且关卡要把"当前图"与"目标图"并排对照）。
- **动画由快照 diff 驱动**，以 commit id 为 key，禁止依赖数组下标。
- 当前阶段（M1/M2）只需保证两个地基：**布局确定性、节点 key 稳定**；动画本体属 P2，地基打对后随时可加。

## 当前进度

**M1 骨架**（`init/add/commit/log` 全链路）：单沙盒会话、D3 提交图 + xterm 终端 + 图形面板并存、命令与面板同一执行链路已跑通。

后续按 `CLAUDE.md` §11 路线图迭代：M2 单人可玩（分支/合并/关卡系统）→ M3 协作（远程模拟、多人房间、冲突与 PR）→ M4 打磨（动画、成就、提示、自由沙盒）。

## 相关文档

- 项目宪法与整体架构：[`CLAUDE.md`](../CLAUDE.md)
- GitGraph 前后端契约：`CLAUDE.md` §5 + [`src/types/gitGraph.ts`](src/types/gitGraph.ts)
- 数据库边界：`database.md`
- 关卡规格：`docs/level-spec.md`
```
