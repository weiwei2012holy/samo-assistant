<!--
/**
 * @Author wei
 * @Date 2026-02-25
 * @Description 代码库代理协作规范与命令指南
 **/
-->

# AI Sidebar - AGENTS

面向代理型编码助手的仓库规范与命令清单，所有自动化修改必须遵循此文档。

## 项目概览
- 技术栈：React 18 + TypeScript 5.6 + Vite 6 + Tailwind CSS 3.4
- Chrome 扩展：Manifest V3
- 包管理：npm（ES Modules）

## 运行与构建命令
以下命令均来自 `package.json`。

```bash
# 开发模式（热重载）
npm run dev

# 构建生产版本（包含 content 脚本构建与静态资源复制）
npm run build

# 仅构建 content 脚本（watch）
npm run dev:content

# 拷贝 public 资源到 dist（build 内部会调用）
npm run copy-files

# 代码检查
npm run lint

# 预览构建结果
npm run preview
```

## 测试与单测
- 当前仓库没有测试框架或测试脚本（`package.json` 未定义 `test`）。
- 因此“单独运行某个测试”目前不适用。
- 若未来引入测试框架（如 Vitest/Jest），请在此处补充“单测运行方式”。

## 环境要求
- 在 `/Users/yidejia/Project` 目录下执行命令前必须设置：`GOPATH=/Users/yidejia/Project`。
- 默认使用 `npm`，不要擅自更换为 `pnpm/yarn`。

## 代码风格与约定
### 文件头部注释（必须）
所有源码文件必须包含以下头部注释（Markdown 等文档也应尽量保留）：

```typescript
/**
 * @Author wei
 * @Date {{当前日期}}
 * @Description {{功能说明}}
 **/
```

### 导入顺序
1. React/框架核心库
2. 第三方库
3. 内部模块（使用 `@/` 路径别名）

示例：
```typescript
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/hooks/useSettings';
```

### 路径别名
- 使用 `@/` 作为 `src/` 目录别名。
- 避免深层相对路径（如 `../../..`）。

### 命名约定
- 组件：PascalCase（文件名 `PascalCase.tsx`）
- Hooks：`useXxx`，文件名 `useXxx.ts`
- 服务：camelCase 文件名（如 `ai.ts`、`storage.ts`）
- 函数/变量：camelCase
- 常量：UPPER_SNAKE_CASE
- 类型/接口：PascalCase

### TypeScript 类型
- 优先使用 `interface` 定义对象类型。
- 使用 `type` 定义联合/交叉/别名。
- Props 接口命名：`${ComponentName}Props`。
- 所有属性需有 JSDoc 注释。

### React 组件规范
- 函数组件 + Hooks。
- 组件类型显式声明（如 `React.FC<Props>`）。
- 需要转发 ref 时使用 `forwardRef` 并设置 `displayName`。
- 对频繁重渲染组件使用 `memo`（按实际需求）。

### Hooks 规范
- 自定义 Hook 必须以 `use` 开头。
- 返回对象包含状态与操作方法。
- 回调函数使用 `useCallback`；必要时使用 `useMemo/useRef`。

### 错误处理
- 异步逻辑使用 `try/catch`。
- `catch` 中不得为空。
- 使用 `console.error` 记录错误，且需要中文描述。
- 面向用户的错误需转换为友好文案（如 `setError`）。

### 样式与组件库
- 使用 Tailwind CSS 工具类。
- 使用 `cn()` 合并类名（`@/lib/utils`）。
- 组件风格遵循 shadcn/ui 变量体系。

## Chrome 扩展相关约定
- `public/background.js` 与 `public/content.js` 为扩展脚本入口。
- 优先使用 `chrome.storage.sync` 存储用户配置。
- 跨脚本通信使用 `chrome.runtime.sendMessage`。

## 禁止事项
- 禁止 `as any`、`@ts-ignore`、`@ts-expect-error`。
- 禁止空 `catch` 块。
- 未经明确许可不得删除文件。
- 未经明确要求不得提交 git commit。

## Git 提交规范
- 提交说明使用中文，尽可能详细描述改动内容。

## Cursor / Copilot 规则
- 未发现 `.cursor/rules/`、`.cursorrules` 或 `.github/copilot-instructions.md`。
- 若未来添加上述规则，请将其内容同步到本文件并遵守。

## 重要参考文件
- `package.json`：构建、lint、预览命令来源。
- `src/hooks/useChat.ts`：Hook 组织、AbortController、错误处理样例。
- `src/components/SettingsPanel.tsx`：React.FC、Props 命名与 UI 组织样例。
- `src/services/ai.ts`：服务层抽象与错误处理样例。
