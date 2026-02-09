/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 应用类型定义
 **/

/**
 * 支持的大模型供应商
 */
export type ModelProvider = 'openai' | 'anthropic' | 'deepseek' | 'openrouter' | 'custom';

/**
 * 模型供应商配置
 */
export interface ProviderConfig {
  /** 供应商标识 */
  provider: ModelProvider;
  /** API 密钥 */
  apiKey: string;
  /** 自定义 API 基础 URL（可选） */
  baseUrl?: string;
  /** 模型名称 */
  model: string;
}

/**
 * 所有供应商的配置映射
 */
export type ProviderConfigMap = Partial<Record<ModelProvider, ProviderConfig>>;

/**
 * 应用设置
 */
export interface AppSettings {
  /** 当前使用的供应商标识 */
  currentProvider: ModelProvider;
  /** 所有供应商的配置 */
  providerConfigs: ProviderConfigMap;
  /** 主题模式 */
  theme: 'light' | 'dark' | 'system';
  /** 是否启用思考模式（用于 DeepSeek Reasoner 等模型） */
  enableReasoning: boolean;
}

/**
 * 页面内容
 */
export interface PageContent {
  /** 页面标题 */
  title: string;
  /** 页面 URL */
  url: string;
  /** 页面描述 */
  description: string;
  /** 页面主要内容 */
  content: string;
  /** 提取时间戳 */
  timestamp: number;
}

/**
 * 聊天消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system';

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

/**
 * 对话会话
 */
export interface ChatSession {
  /** 会话 ID */
  id: string;
  /** 关联的页面 URL */
  pageUrl: string;
  /** 页面标题 */
  pageTitle: string;
  /** 消息列表 */
  messages: ChatMessage[];
  /** 创建时间 */
  createdAt: number;
}

/**
 * API 响应
 */
export interface APIResponse {
  /** 响应内容 */
  content: string;
  /** 使用的 token 数量 */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * 供应商选项
 */
export interface ProviderOption {
  /** 供应商标识 */
  value: ModelProvider;
  /** 显示名称 */
  label: string;
  /** 默认模型列表 */
  models: string[];
  /** 默认 API URL */
  defaultBaseUrl: string;
}

/**
 * OpenRouter 模型信息
 */
export interface OpenRouterModel {
  /** 模型 ID */
  id: string;
  /** 模型名称 */
  name: string;
  /** 是否免费 */
  isFree: boolean;
  /** 上下文长度 */
  contextLength?: number;
}
