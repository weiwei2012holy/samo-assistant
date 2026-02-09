# AI Sidebar - 智能页面助手

Chrome 浏览器侧边栏扩展，使用大模型总结和对话当前网页内容。

## 技术栈

- **框架**: React 18 + TypeScript 5.6
- **构建工具**: Vite 6
- **样式**: Tailwind CSS 3.4 + shadcn/ui 风格组件
- **Chrome 扩展**: Manifest V3
- **包管理**: npm (ES Modules)

## 项目结构

```
ai-sidebar/
├── public/                 # 静态资源（Chrome 扩展相关）
│   ├── manifest.json      # 扩展清单 (Manifest V3)
│   ├── background.js      # Service Worker
│   ├── content.js         # 内容脚本（浮窗按钮、页面内容提取）
│   ├── content.css        # 浮窗样式
│   └── icons/             # 图标文件
├── src/
│   ├── components/        # React 组件
│   │   ├── ui/           # 基础 UI 组件 (shadcn/ui 风格)
│   │   ├── Markdown.tsx  # Markdown 渲染
│   │   └── SettingsPanel.tsx
│   ├── hooks/            # 自定义 Hooks
│   │   ├── useSettings.ts
│   │   ├── usePageContent.ts
│   │   └── useChat.ts
│   ├── services/         # 服务层
│   │   ├── ai.ts        # AI API 调用
│   │   └── storage.ts   # Chrome 存储
│   ├── types/            # TypeScript 类型定义
│   ├── lib/              # 工具函数
│   └── sidepanel/        # 侧边栏入口
├── sidepanel.html        # 侧边栏 HTML 入口
└── dist/                 # 构建输出
```

## 构建与开发命令

```bash
# 开发模式（热重载）
npm run dev

# 构建生产版本
npm run build

# 代码检查
npm run lint

# 预览构建结果
npm run preview
```

**注意**: 本项目无测试配置，暂无测试命令。

## 代码风格规范

### 文件头部注释（必须）

每个文件必须包含标准头部注释：
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

```typescript
import React, { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/hooks/useSettings';
import { ChatMessage, ProviderConfig } from '@/types';
```

### 命名约定

| 类型 | 约定 | 示例 |
|------|------|------|
| 组件 | PascalCase | `SettingsPanel`, `MessageBubble` |
| 文件名（组件） | PascalCase.tsx | `SettingsPanel.tsx` |
| 文件名（Hooks） | camelCase.ts | `useChat.ts` |
| 文件名（服务） | camelCase.ts | `storage.ts` |
| 函数/变量 | camelCase | `sendMessage`, `isLoading` |
| 常量 | UPPER_SNAKE_CASE | `STORAGE_KEYS`, `PROVIDER_BASE_URLS` |
| 类型/接口 | PascalCase | `ChatMessage`, `ProviderConfig` |

### TypeScript 类型定义

- 优先使用 `interface` 定义对象类型
- 使用 `type` 定义联合类型、交叉类型
- Props 接口命名: `${ComponentName}Props`
- 所有属性必须有 JSDoc 注释

```typescript
/**
 * 聊天消息
 */
export interface ChatMessage {
  /** 消息 ID */
  id: string;
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 创建时间 */
  createdAt: number;
}

export type MessageRole = 'user' | 'assistant' | 'system';
```

### 组件编写规范

- 使用函数组件 + Hooks
- 使用 `React.FC<Props>` 显式声明类型
- 使用 `memo` 优化需要避免重渲染的组件
- 使用 `forwardRef` 处理需要 ref 转发的组件

```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, ...props }, ref) => {
    return <button ref={ref} className={cn(buttonVariants({ variant }), className)} {...props} />;
  }
);
Button.displayName = 'Button';
```

### Hooks 编写规范

- 自定义 Hook 以 `use` 开头
- 返回对象包含状态和操作方法
- 使用 `useCallback` 包装回调函数

```typescript
export function useChat(config: ProviderConfig, tabId: number | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    // 实现...
  }, [/* 依赖项 */]);

  return { messages, isLoading, sendMessage };
}
```

### 错误处理

- 使用 try-catch 捕获异步错误
- 使用 `console.error` 记录错误（带中文描述）
- 向用户展示友好的错误信息

```typescript
try {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status}`);
  }
} catch (error) {
  console.error('发送消息失败:', error);
  const message = error instanceof Error ? error.message : '操作失败';
  setError(message);
}
```

### 样式规范

- 使用 Tailwind CSS 工具类
- 使用 `cn()` 工具函数合并类名（来自 `@/lib/utils`）
- 遵循 shadcn/ui 设计系统的 CSS 变量

```typescript
import { cn } from '@/lib/utils';

<div className={cn(
  'flex items-center gap-2 p-3 rounded-lg',
  isActive && 'bg-primary text-primary-foreground'
)} />
```

### 路径别名

使用 `@/` 作为 `src/` 目录的别名：
```typescript
import { Button } from '@/components/ui/button';
import { useChat } from '@/hooks/useChat';
```

## Chrome 扩展特定规范

- 使用 `chrome.storage.sync` 存储用户配置（跨设备同步）
- 使用 `chrome.runtime.sendMessage` 进行跨脚本通信
- Service Worker (`background.js`) 使用原生 JavaScript
- Content Script (`content.js`) 使用原生 JavaScript

## 禁止事项

- 禁止使用 `as any` 或 `@ts-ignore` 绕过类型检查
- 禁止删除文件（除非明确要求）
- 禁止使用空的 catch 块
- 禁止未经确认擅自提交 git commit

## Git 提交规范

提交说明使用中文，尽可能详细描述改动内容。
