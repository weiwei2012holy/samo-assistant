/**
 * @Author wei
 * @Date 2026-03-30
 * @Description AI 供应商工厂，根据协议类型创建对应的 Provider 实例
 **/

import { getProviderAPIType } from '@/config/providers';
import { ModelProvider } from '@/types';
import { AIProvider } from './index';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';

/**
 * AI 供应商工厂
 */
export class AIProviderFactory {
  private static providers: Map<string, AIProvider> = new Map();

  /**
   * 根据供应商获取对应的 Provider 实例
   * @param provider - 供应商标识
   */
  static getProvider(provider: ModelProvider): AIProvider {
    const apiType = getProviderAPIType(provider);

    // 如果已经缓存了该协议的实例，则直接返回
    if (this.providers.has(apiType)) {
      return this.providers.get(apiType)!;
    }

    let instance: AIProvider;

    switch (apiType) {
      case 'anthropic':
        instance = new AnthropicProvider();
        break;
      case 'openai-compatible':
      default:
        instance = new OpenAIProvider();
        break;
    }

    this.providers.set(apiType, instance);
    return instance;
  }
}
