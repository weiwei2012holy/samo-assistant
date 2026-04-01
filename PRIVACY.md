# 隐私政策 / Privacy Policy

**Samo 助手（AI Sidebar）**

最后更新：2026-04-01

---

## 中文

### 概述

Samo 助手是一款 Chrome 浏览器扩展，帮助用户借助自行配置的 AI 大模型对网页内容进行总结、对话和翻译。本扩展高度重视用户隐私，不收集、不存储、不出售任何个人数据。

### 数据处理说明

#### 页面内容与选中文本
- 仅在用户**主动触发**（点击总结、悬停翻译、右键菜单等）时读取当前页面的文本内容或选中文本。
- 上述内容会直接从用户浏览器发送至**用户自行配置的第三方 AI 服务**（如 OpenAI、Anthropic、DeepSeek 等），扩展开发者无法访问、不会接收这些数据。
- 数据不会被持久化存储，不会用于任何与 AI 请求无关的目的。

#### 用户配置（API 密钥、模型设置等）
- 通过 Chrome 内置的 `chrome.storage.sync` 保存在用户的 Chrome 账号本地存储中。
- 开发者服务器无法读取这些数据。
- API 密钥仅用于向用户指定的 AI 服务发起请求。

#### 界面状态（浮窗位置、窗口尺寸）
- 通过 `chrome.storage.local` 保存在用户本地设备中，仅用于恢复界面布局，不包含任何个人信息。

### 不收集的数据
本扩展**不会**：
- 收集或上传用户的浏览历史、个人信息或行为数据
- 将任何数据出售或共享给第三方（用户指定的 AI 服务除外，该传输由用户主动发起）
- 集成任何分析工具、广告 SDK 或追踪脚本
- 在开发者服务器上存储任何用户数据

### 数据删除
用户可随时通过以下方式删除本扩展存储的所有数据：
1. 在 Chrome 扩展管理页面（`chrome://extensions/`）卸载本扩展
2. 或在扩展设置中清除配置

### 联系方式
如有隐私相关问题，请通过 [GitHub Issues](https://github.com/weiwei2012holy/ai-sidebar/issues) 联系我们。

---

## English

### Overview

Samo Assistant (AI Sidebar) is a Chrome extension that helps users summarize, chat about, and translate web page content using a self-configured AI model. We take user privacy seriously and do not collect, store, or sell any personal data.

### Data Handling

#### Page Content & Selected Text
- Page text or selected text is only read when the user **actively triggers** an action (e.g., summarize, hover translate, context menu).
- This content is sent directly from the user's browser to the **third-party AI service configured by the user** (e.g., OpenAI, Anthropic, DeepSeek). The extension developer cannot access or receive this data.
- Data is not persisted and is not used for any purpose beyond fulfilling the AI request.

#### User Configuration (API Keys, Model Settings, etc.)
- Stored locally in the user's Chrome account via Chrome's built-in `chrome.storage.sync`.
- The developer's servers have no access to this data.
- API keys are used solely to make requests to the user-specified AI service.

#### UI State (Window Position, Size)
- Stored locally on the user's device via `chrome.storage.local` to restore the interface layout. Contains no personal information.

### Data We Do NOT Collect
This extension does **not**:
- Collect or upload browsing history, personal information, or behavioral data
- Sell or share any data with third parties (except the AI service explicitly chosen by the user, which is initiated by the user)
- Include any analytics tools, advertising SDKs, or tracking scripts
- Store any user data on developer servers

### Data Deletion
Users can delete all data stored by this extension at any time by:
1. Uninstalling the extension from Chrome's extension management page (`chrome://extensions/`)
2. Or clearing the configuration within the extension's settings

### Contact
For privacy-related questions, please contact us via [GitHub Issues](https://github.com/weiwei2012holy/ai-sidebar/issues).
