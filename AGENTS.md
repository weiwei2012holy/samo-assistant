<!--
/**
 * @Author wei
 * @Date 2026-03-30
 * @Description AI Sidebar 仓库级代理协作规范
 **/
-->

# AI Sidebar - AGENTS

本文件是仓库级默认指令，适用于本项目所有目录。

## 项目定位
- 技术栈：React 18 + TypeScript 5.6 + Vite 6 + Tailwind CSS 3.4。
- 形态：Chrome 扩展（Manifest V3）+ Side Panel React 应用。
- 包管理：仅使用 npm。

## Build And Lint
- 在 `/Users/yidejia/Project` 目录下执行任何命令前，必须先设置：`GOPATH=/Users/yidejia/Project`。
- 常用命令以 `package.json` 为准：`npm run dev`、`npm run dev:content`、`npm run build`、`npm run lint`、`npm run preview`。
- 当前仓库无测试脚本（无 `npm test`）。如需验证改动，优先运行 `npm run lint`，必要时补充 `npm run build`。  

## 架构要点
- Hook 依赖链保持为：`useSettings -> usePageContent -> useChat(tabId) -> usePendingTask -> useTabManager`。
- `currentTabId` 应保留在 `src/sidepanel/App.tsx`，用于打破 `useChat` 与 `useTabManager` 的循环依赖。
- 多 Tab 对话隔离依赖 `src/hooks/useChat.ts` 中的模块级 `Map<number, TabChatState>`，切换 Tab 时需要恢复状态并中断旧请求。
- AI 协议分层由 `src/services/ai.ts` + `src/config/providers.ts` 统一维护；新增供应商优先在 `PROVIDER_DEFINITIONS` 中扩展。
- Content Script 源码入口为 `src/content/content.ts`，产物为 `dist/content.js`（IIFE），由 `vite.content.config.ts` 构建。

## 代码约定
- 所有源码文件必须包含统一头部注释：

```typescript
/**
 * @Author wei
 * @Date {{当前日期}}
 * @Description {{功能说明}}
 **/
```

- 导入顺序：框架核心库 -> 第三方库 -> 内部模块（`@/` 别名）。
- 使用 `@/` 指向 `src/`，避免深层相对路径。
- TypeScript：对象结构优先 `interface`，联合/交叉使用 `type`。
- 错误处理：禁止空 `catch`，必须 `console.error('中文错误描述', error)`，并给用户友好提示。
- 样式：使用 Tailwind 工具类与 `cn()`（`src/lib/utils.ts`）。

## 禁止事项
- 禁止 `as any`、`@ts-ignore`、`@ts-expect-error`。
- 未经明确许可不得删除文件。
- 未经明确要求不得执行 `git commit`。

## 链接索引（避免重复维护）
- 详细架构与模块说明：`CLAUDE.md`
- 产品功能与安装说明：`README.md`
- 命令与依赖来源：`package.json`
- 关键实现参考：`src/sidepanel/App.tsx`、`src/hooks/useChat.ts`、`src/hooks/usePendingTask.ts`、`src/hooks/useTabManager.ts`、`src/services/ai.ts`
