/**
 * @Author wei
 * @Date 2026-02-24
 * @Description 供应商统一配置中心
 *
 * 所有供应商的元数据（名称、API 地址、预设模型、协议类型）在此统一维护。
 * 新增供应商只需在 PROVIDER_DEFINITIONS 中添加一条记录，无需修改其他文件。
 **/

import { ModelProvider } from '@/types';

/**
 * API 协议类型
 * - openai-compatible: 兼容 OpenAI Chat Completions 格式（OpenAI、DeepSeek、智谱、OpenRouter、自定义）
 * - anthropic: Anthropic Messages API 格式（消息结构、鉴权头、事件流格式均不同）
 */
export type APIProtocol = 'openai-compatible' | 'anthropic';

/**
 * 供应商完整定义
 */
export interface ProviderDefinition {
  /** 供应商唯一标识，与 ModelProvider 类型对应 */
  value: ModelProvider;
  /** UI 显示名称 */
  label: string;
  /** 默认 API 基础 URL（不含具体路径，如 /chat/completions） */
  baseUrl: string;
  /** 预设模型列表；空数组表示需动态加载或用户手动输入 */
  models: string[];
  /** API 协议类型，决定 ai.ts 中使用哪套调用方式 */
  apiType: APIProtocol;
}

/**
 * 所有供应商的完整配置列表。
 * 数组顺序决定设置面板中供应商下拉选项的显示顺序。
 */
export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    value: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    apiType: 'openai-compatible',
  },
  {
    value: 'anthropic',
    label: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-5-20250929', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    apiType: 'anthropic',
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    apiType: 'openai-compatible',
  },
  {
    value: 'zhipu',
    label: '智谱 AI (免费)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4.7-flash', 'glm-4.6v-flash', 'glm-4.1v-thinking-flash', 'glm-4-flash-250414', 'glm-4v-flash'],
    apiType: 'openai-compatible',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter (免费模型)',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [], // 运行时通过 API 动态加载
    apiType: 'openai-compatible',
  },
  {
    value: 'custom',
    label: '自定义 (OpenAI 兼容)',
    baseUrl: '', // 用户必须手动填写
    models: [], // 用户手动输入模型名称
    apiType: 'openai-compatible',
  },
];

/**
 * 供应商 Map，用于 O(1) 查找
 * 键为 ModelProvider，值为对应的 ProviderDefinition
 */
export const PROVIDER_MAP: Record<ModelProvider, ProviderDefinition> =
  Object.fromEntries(
    PROVIDER_DEFINITIONS.map(p => [p.value, p])
  ) as Record<ModelProvider, ProviderDefinition>;

/**
 * 获取供应商的默认 API 基础 URL
 * @param provider 供应商标识
 * @returns 默认基础 URL，custom 和未知供应商返回空字符串
 */
export function getProviderBaseUrl(provider: ModelProvider): string {
  return PROVIDER_MAP[provider]?.baseUrl ?? '';
}

/**
 * 获取供应商的 API 协议类型
 * @param provider 供应商标识
 * @returns API 协议类型，未知供应商默认返回 'openai-compatible'
 */
export function getProviderAPIType(provider: ModelProvider): APIProtocol {
  return PROVIDER_MAP[provider]?.apiType ?? 'openai-compatible';
}
