# Samo 助手(AI Sidebar) - 智能页面助手

[![Build and Release](https://github.com/weiwei2012holy/ai-sidebar/actions/workflows/build.yml/badge.svg)](https://github.com/weiwei2012holy/ai-sidebar/actions/workflows/build.yml)
[![GitHub Release](https://img.shields.io/github/v/release/weiwei2012holy/ai-sidebar)](https://github.com/weiwei2012holy/ai-sidebar/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一款 Chrome 浏览器侧边栏插件，使用大模型总结和对话当前网页内容。

## 关于命名

可爱的萨摩耶是你贴心的 AI 助手！这只毛茸茸的小狗是开发者的宠物，它温暖、友好、总是乐于助人的性格正是我们希望这个 AI 助手带给你的体验。

## 下载安装

### 方式一：从 Release 下载（推荐）

1. 前往 [Releases 页面](https://github.com/weiwei2012holy/ai-sidebar/releases)
2. 下载最新版本的 `ai-sidebar-vX.X.X.zip`
3. 解压 ZIP 文件
4. 打开 Chrome 浏览器，访问 `chrome://extensions/`
5. 开启右上角的「开发者模式」
6. 点击「加载已解压的扩展程序」
7. 选择解压后的文件夹

### 方式二：从源码开发与构建

#### 1. 克隆与安装依赖

```bash
# 克隆仓库
git clone https://github.com/weiwei2012holy/ai-sidebar.git
cd ai-sidebar

# 安装依赖
npm install
```

#### 2. 本地开发模式 (Development)

在本地启动开发调试，可以在修改代码时让界面自动刷新：

```bash
# 启动宿主页面开发监听
npm run dev

# 启动 Content Script 内容脚本的自动编译监听
npm run dev:content
```

> [!NOTE]
> 随后在 Chrome 浏览器打开 `chrome://extensions/`，开启右上角的「开发者模式」，点击「加载已解压的扩展程序」，选择项目根目录下的 **`dist/`** 目录即可挂载运行。修改代码后页面将自动热重载。

#### 3. 生产环境打包与发布 (Build & Package)

如果您需要打包最新版以更新发布到 **Chrome Web Store**，可以直接调用内置的自动化流水线打包指令：

```bash
# 自动递增版本号、进行生产编译并一键压缩输出 samo-assistant.zip
GOPATH=/Users/yidejia/Project npm run package
```

> [!TIP]
> 运行该指令时，后台打包流程会自动将 `package.json` 和 `manifest.json` 中的版本号最后一位（Patch）自增 +1（例如从 `1.2.4` 自增为 `1.2.5`），清理旧 ZIP，执行严格的 TypeScript 静态检查与 Vite 生产环境构建，最后将 `dist/` 内部的所有产物自动压缩成根目录下的 **`samo-assistant.zip`**，您可以直接将此压缩包上传至谷歌扩展应用商店后台进行审核发布。


## 功能特点

- **页面总结**：一键总结当前网页的主要内容
- **智能对话**：基于页面内容与 AI 进行对话
- **悬停翻译**：按住快捷键悬停在段落上即可实时翻译，支持选中文本优先翻译
- **多供应商支持**：支持 OpenAI、Anthropic (Claude)、DeepSeek、OpenRouter 等多种大模型
- **数据同步**：使用 chrome.storage.sync 同步配置，多设备无缝使用
- **流式响应**：支持流式输出，实时查看 AI 回复
- **Markdown 渲染**：支持 Markdown 格式的 AI 回复
- **右键菜单**：选中文本后右键可快速翻译、解释、总结或在侧边栏中提问
- **常用问题**：支持配置常用问题模板（翻译、解释、总结等），选中文本后一键提问
- **浮窗按钮**：页面右下角的萨摩耶图标，支持拖拽移位；未激活时小狗在睡觉，激活后眨眼、摇舌、耳朵抖动
- **页面内浮窗**：助手以独立浮窗形式嵌入页面，可拖拽、可调整大小，拖出屏幕自动吸附边缘
- **深色模式**：自动跟随系统偏好或检测网站背景色，适配深色主题网站
- **标签页隔离**：每个标签页独立的对话上下文
- **iframe 支持**：支持在 iframe 内的页面（如文档站点）使用翻译功能

## 配置

1. 点击浏览器工具栏的扩展图标打开侧边栏
2. 点击右上角的设置图标
3. 选择您的 AI 供应商（OpenAI、Anthropic、DeepSeek 或自定义）
4. 输入您的 API 密钥
5. 选择要使用的模型
6. 设置悬停翻译快捷键（默认为 Ctrl）
7. 点击保存

## 使用方法

### 基本使用
1. 在任意网页上点击扩展图标或页面右下角的萨摩耶图标打开侧边栏
2. 点击「一键总结页面」生成页面摘要
3. 在输入框中输入问题与 AI 对话

### 右键菜单
1. 在网页上选中文本
2. 右键点击选择「AI 助手」
3. 选择翻译、解释、总结可直接执行
4. 选择「在侧边栏中提问」会打开侧边栏显示常用问题按钮，点击即可快速提问，也可手动输入自定义问题

### 浮窗按钮
- 萨摩耶图标默认处于睡觉状态（闭眼、冒 Zzz）
- 激活后切换为清醒状态（眨眼、摇舌、耳朵轻抖），并有呼吸光晕效果
- 支持拖拽到页面任意位置
- 点击打开页面内浮窗助手；再次点击关闭

### 悬停翻译
- 按住快捷键（默认 Ctrl，可在设置中自定义为 Alt/Shift/Cmd）
- 将鼠标悬停在想要翻译的段落上
- 翻译结果会实时显示在段落下方
- 如果先选中文本再按快捷键，会优先翻译选中的内容
- 翻译结果会保持显示，点击关闭按钮可移除
- 支持在 iframe 内的页面使用（如 Three.js 文档等）

### 页面内浮窗
- 点击浮窗按钮后，助手以独立窗口嵌入当前页面（无需打开侧边栏）
- 拖拽标题栏可任意移动；在屏幕内松手即停，拖出屏幕边缘后自动吸附回来
- 拖动右下角手柄可调整窗口大小
- 自动检测网站是否为深色主题（包括系统深色模式和网站自定义深色），对应切换界面配色

### 常用问题
- 选中文本后使用右键菜单「在侧边栏中提问」
- 侧边栏会显示常用问题快捷按钮（翻译、解释、一句话总结）
- 点击按钮即可快速提问，也可以在输入框手动输入自定义问题
- 在设置页面可以自定义常用问题模板，使用 `{{text}}` 作为选中文本占位符

## 显示模式与交互特性

Samo 助手提供了三种灵活的展示模式，您可以在设置面板或助手顶部的切换按钮中随时切换。不同模式因底层的物理实现差异，其交互与会话保持的行为有所不同：

### 1. 页面内浮窗 (Overlay)
*   **交互表现**：助手作为一个半透明/毛玻璃质感的独立悬浮窗嵌入在网页中。支持自由拖拽移动（拖出屏幕边缘会自动弹回吸附）以及拖动右下角缩放窗口大小。
*   **隐藏与关闭**：点击页面右下角的萨摩耶 ICON 或点击关闭时，助手仅在 DOM 树中被 CSS 设置为**隐藏 (display: none)**。
*   **会话保持**：由于 React 实例和 DOM 节点在隐藏时**并未销毁**，因此当您再次点击 ICON 显示时，当前页面的会话聊天数据、思考状态和提取的页面内容等都将**原封不动地保留**。

### 2. 独立窗口 (Window)
*   **交互表现**：助手将以一个独立的 OS 级 Chrome Popup 弹窗形式弹出，独立于当前浏览器的主窗口，非常适合双屏协作或需要更大视野的场景。
*   **隐藏与关闭**：关闭独立窗口时，扩展后台会彻底**物理销毁（关闭）**该弹窗进程。
*   **会话保持**：因为窗口进程被销毁，内存中的状态不保留。但再次打开时，Samo 助手会触发**会话数据恢复机制**：从本地 `chrome.storage.local` 读取该网页的历史对话。当前窗口没有消息时，会在顶部显示 **“找到 X 条历史消息” 的恢复横幅**，您可以点击 **“加载会话”** 一键复原历史聊天。

### 3. 浏览器侧边栏 (Sidepanel)
*   **交互表现**：调用 Chrome 原生的 Side Panel API，将助手固定在浏览器右侧（或左侧），不干扰网页主干内容的渲染。
*   **隐藏与关闭**：侧边栏是标签页特定的（Tab-specific），当您切换至未启用侧边栏的标签页时，侧边栏会自动隐藏；切回原标签页时，Chrome 会自动将其重新显示。由于 Chrome 规范限制，扩展程序无法通过代码强行关闭侧边栏，需要用户手动点击侧边栏的关闭按钮。
*   **会话保持**：只要侧边栏所绑定的标签页（Tab）没有被关闭，该标签页的对话上下文和内存状态就会一直常驻。当您在不同标签页之间切换时，侧边栏会自动完成页面内容的重新抓取以及该网页贴心对话的拉取。


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
| Anthropic | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 |
| DeepSeek | deepseek-chat, deepseek-reasoner |
| 智谱 AI | glm-4.7-flash, glm-4.6v-flash, glm-4.1v-thinking-flash 等免费模型 |
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
