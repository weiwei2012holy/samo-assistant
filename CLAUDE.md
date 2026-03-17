# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
# 开发模式（侧边栏热重载）
npm run dev

# 同时监听 content script 变化（需单独终端）
npm run dev:content

# 构建完整产物（tsc 类型检查 + 侧边栏 + 复制 public/ + content script）
npm run build

# 代码检查
npm run lint
```

> 执行前需设置环境变量：`GOPATH=/Users/yidejia/Project`
> 当前无测试框架，不存在 `npm test`。

## 构建产物说明

构建分为两个独立的 Vite 目标：

- **侧边栏**（`vite.config.ts`）：React SPA，入口为 `sidepanel.html`，产物输出到 `dist/assets/`
- **Content Script**（`vite.content.config.ts`）：以 IIFE 格式打包 `src/content/content.ts`，产物为 `dist/content.js`，由 `manifest.json` 直接引用，不含 ES Module 语法

`public/` 下的静态文件（`manifest.json`、`background.js`、图标等）由 `copy-files` 脚本复制到 `dist/`。

## 架构概览

### Hook 依赖链（重要）

`App.tsx` 中各 Hook 的依赖顺序：

```
useSettings → usePageContent → useChat(tabId) → usePendingTask → useTabManager
```

`currentTabId` 状态故意保留在 `App.tsx`，以打破 `useChat` 与 `useTabManager` 之间的循环依赖：`useTabManager` 通过回调写入，`useChat` 直接消费。

### 多 Tab 对话隔离

`useChat` 使用模块级 `Map<number, TabChatState>`（`tabChatStates`）按 Tab ID 隔离对话历史。切换 Tab 时会 abort 当前请求并从 Map 中恢复目标 Tab 的对话状态。

### AI 服务层（`src/services/ai.ts`）

`AIService` 类封装两种 API 协议：
- **`openai-compatible`**：OpenAI、DeepSeek、智谱 AI、OpenRouter、自定义
- **`anthropic`**：Anthropic Messages API（消息结构、鉴权头、SSE 事件格式均不同）

协议类型由 `src/config/providers.ts` 的 `PROVIDER_DEFINITIONS` 统一维护，新增供应商只需在该文件添加一条记录。

DeepSeek Reasoner 的 `reasoning_content` 思考内容在 `enableReasoning` 为 `true` 时被包裹为 `<think>...</think>` 插入消息。

### Content Script（`src/content/content.ts`）

负责三项独立功能，均在同一文件中：

1. **浮窗按钮**：可拖拽的悬浮 UI，点击展开菜单（打开侧边栏 / 总结页面），通过 `chrome.runtime.sendMessage` 通知 background
2. **页面内容提取**：监听 `EXTRACT_CONTENT` 消息，按 `article > main > body` 优先级抓取文本，内容截断 50000 字符
3. **悬停翻译**：长按配置的修饰键（默认 `Control`，150ms 防误触）激活翻译模式，支持选中文本和鼠标悬停段落，带缓存和流式输出

### 任务调度（`usePendingTask`）

处理来自右键菜单 / 浮窗的延迟任务：
- 使用排他锁 `taskExecutingRef` 防止并发执行
- `summarize_page` 在页面内容未就绪时入队，内容加载后自动执行
- 使用 callback ref 模式，EXECUTE_TASK 监听器只注册一次

### 存储

设置通过 `chrome.storage.sync` 读写，key 为 `ai_sidebar_settings`，结构见 `src/types/index.ts` 的 `AppSettings`。

## 代码规范

### 文件头部注释（必须）

所有源码文件必须包含：

```typescript
/**
 * @Author wei
 * @Date {{当前日期}}
 * @Description {{功能说明}}
 **/
```

### 路径别名

使用 `@/` 代替 `src/`，避免深层相对路径。

### 禁止事项

- 禁止 `as any`、`@ts-ignore`、`@ts-expect-error`
- 禁止空 `catch` 块（错误必须用中文描述后 `console.error`）
- 未经允许不得删除文件
- 未经明确要求不得执行 `git commit`
