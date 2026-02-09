# AI Sidebar - 智能页面助手

[![Build and Release](https://github.com/YOUR_USERNAME/ai-sidebar/actions/workflows/build.yml/badge.svg)](https://github.com/YOUR_USERNAME/ai-sidebar/actions/workflows/build.yml)
[![GitHub Release](https://img.shields.io/github/v/release/YOUR_USERNAME/ai-sidebar)](https://github.com/YOUR_USERNAME/ai-sidebar/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一款 Chrome 浏览器侧边栏插件，使用大模型总结和对话当前网页内容。

## 关于命名

可爱的萨摩耶是你贴心的 AI 助手！这只毛茸茸的小狗是开发者的宠物，它温暖、友好、总是乐于助人的性格正是我们希望这个 AI 助手带给你的体验。

## 下载安装

### 方式一：从 Release 下载（推荐）

1. 前往 [Releases 页面](https://github.com/YOUR_USERNAME/ai-sidebar/releases)
2. 下载最新版本的 `ai-sidebar-vX.X.X.zip`
3. 解压 ZIP 文件
4. 打开 Chrome 浏览器，访问 `chrome://extensions/`
5. 开启右上角的「开发者模式」
6. 点击「加载已解压的扩展程序」
7. 选择解压后的文件夹

### 方式二：从源码构建

```bash
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/ai-sidebar.git
cd ai-sidebar

# 安装依赖
npm install

# 构建项目
npm run build

# 然后按照上述步骤 4-7 加载 dist 目录
```

## 功能特点

- **页面总结**：一键总结当前网页的主要内容
- **智能对话**：基于页面内容与 AI 进行对话
- **多供应商支持**：支持 OpenAI、Anthropic (Claude)、DeepSeek 等多种大模型
- **数据同步**：使用 chrome.storage.sync 同步配置，多设备无缝使用
- **流式响应**：支持流式输出，实时查看 AI 回复
- **Markdown 渲染**：支持 Markdown 格式的 AI 回复
- **右键菜单**：选中文本后右键可快速翻译、解释、总结
- **浮窗按钮**：页面右下角的萨摩耶图标，快捷打开/关闭侧边栏或一键总结页面
- **标签页隔离**：每个标签页独立的对话上下文

## 配置

1. 点击浏览器工具栏的扩展图标打开侧边栏
2. 点击右上角的设置图标
3. 选择您的 AI 供应商（OpenAI、Anthropic、DeepSeek 或自定义）
4. 输入您的 API 密钥
5. 选择要使用的模型
6. 点击保存

## 使用方法

### 基本使用
1. 在任意网页上点击扩展图标或页面右下角的萨摩耶图标打开侧边栏
2. 点击「一键总结页面」生成页面摘要
3. 在输入框中输入问题与 AI 对话

### 右键菜单
1. 在网页上选中文本
2. 右键点击选择「AI 助手」
3. 选择翻译、解释、总结或提问

### 浮窗按钮
- 点击萨摩耶图标展开菜单
- 点击侧边栏图标：打开/关闭侧边栏
- 点击星星图标：一键总结当前页面

## 技术栈

- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui 风格组件
- Chrome Extension Manifest V3

## 目录结构

```
ai-sidebar/
├── public/                 # 静态资源
│   ├── manifest.json      # Chrome 扩展清单
│   ├── background.js      # Service Worker
│   ├── content.js         # 内容脚本（浮窗按钮、页面内容提取）
│   ├── content.css        # 浮窗样式
│   └── icons/             # 图标文件
├── src/
│   ├── components/        # React 组件
│   │   ├── ui/           # 基础 UI 组件
│   │   ├── Markdown.tsx  # Markdown 渲染组件
│   │   └── SettingsPanel.tsx # 设置面板
│   ├── hooks/            # 自定义 Hooks
│   │   ├── useSettings.ts   # 设置管理
│   │   ├── usePageContent.ts # 页面内容获取
│   │   └── useChat.ts       # 聊天状态管理
│   ├── services/         # 服务层
│   │   ├── ai.ts        # AI API 调用
│   │   └── storage.ts   # Chrome 存储
│   ├── types/            # TypeScript 类型定义
│   └── sidepanel/        # 侧边栏入口
├── scripts/              # 构建脚本
└── dist/                 # 构建输出
```

## 支持的供应商

| 供应商 | 支持的模型 |
|--------|-----------|
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo |
| Anthropic | claude-sonnet-4-5-20250929, claude-3-5-sonnet, claude-3-5-haiku |
| DeepSeek | deepseek-chat, deepseek-reasoner |
| OpenRouter | 自动获取免费模型列表 |
| 自定义 | 任何 OpenAI 兼容的 API |

### OpenRouter 免费模型

[OpenRouter](https://openrouter.ai) 是一个 AI 模型路由服务，提供多个免费模型供使用。选择 OpenRouter 供应商后：

1. 会自动获取当前可用的免费模型列表
2. 模型名称后会显示上下文长度（如 128K）
3. 点击刷新按钮可以获取最新的模型列表
4. 需要在 [OpenRouter](https://openrouter.ai/keys) 获取 API 密钥

## 自定义图标

如果你想使用自己的图片作为应用图标：

```bash
# 使用你的图片生成图标
node scripts/generate-icons-from-image.cjs 你的图片.png

# 重新构建
npm run build
```

## 许可证

MIT
