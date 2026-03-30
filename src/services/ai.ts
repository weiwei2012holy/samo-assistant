/**
 * @Author wei
 * @Date 2026-03-30
 * @Description 大模型 API 调用服务，采用策略模式支持多供应商扩展
 **/

import { ProviderConfig, APIResponse, ChatMessage, OpenRouterModel } from '@/types';
import { AIProviderFactory } from './providers/factory';

/**
 * AI API 服务类
 * 作为门面类，负责协调具体的 Provider 实现
 */
class AIService {
  /**
   * 发送聊天请求
   * @param config - 供应商配置
   * @param messages - 聊天消息历史
   * @param systemPrompt - 系统提示词
   * @param onStream - 流式响应回调
   * @param enableReasoning - 是否启用思考模式
   */
  async chat(
    config: ProviderConfig,
    messages: ChatMessage[],
    systemPrompt?: string,
    onStream?: (chunk: string) => void,
    enableReasoning: boolean = false
  ): Promise<APIResponse> {
    const provider = AIProviderFactory.getProvider(config.provider);
    return provider.chat(config, messages, systemPrompt, onStream, enableReasoning);
  }

  /**
   * 生成页面总结
   * @param config - 供应商配置
   * @param pageContent - 页面内容
   * @param onStream - 流式响应回调
   * @param enableReasoning - 是否启用思考模式
   */
  async summarize(
    config: ProviderConfig,
    pageContent: string,
    onStream?: (chunk: string) => void,
    enableReasoning: boolean = false
  ): Promise<APIResponse> {
    const systemPrompt = `你是一个专业的内容分析助手。请对用户提供的网页内容进行总结分析。

要求：
1. 提供一个简洁的摘要（2-3句话）
2. 列出主要观点或要点（3-5个）
3. 如果内容包含数据或结论，请突出显示
4. 使用中文回复

请使用清晰的格式输出结果。`;

    const messages: ChatMessage[] = [
      {
        id: '1',
        role: 'user',
        content: `请总结以下网页内容：\n\n${pageContent}`,
        createdAt: Date.now(),
      },
    ];

    return this.chat(config, messages, systemPrompt, onStream, enableReasoning);
  }

  /**
   * 获取 OpenRouter 免费模型列表
   * @returns 免费模型列表
   */
  async getOpenRouterFreeModels(): Promise<OpenRouterModel[]> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models');

      if (!response.ok) {
        throw new Error(`获取模型列表失败: ${response.status}`);
      }

      const data = await response.json();
      const models: OpenRouterModel[] = [];

      // 筛选免费模型（prompt 和 completion 价格都为 0）
      for (const model of data.data || []) {
        const promptPrice = parseFloat(model.pricing?.prompt || '1');
        const completionPrice = parseFloat(model.pricing?.completion || '1');

        if (promptPrice === 0 && completionPrice === 0) {
          models.push({
            id: model.id,
            name: model.name || model.id,
            isFree: true,
            contextLength: model.context_length,
          });
        }
      }

      // 按名称排序
      models.sort((a, b) => a.name.localeCompare(b.name));

      return models;
    } catch (error) {
      console.error('获取 OpenRouter 模型列表失败:', error);
      return [];
    }
  }
}

// 导出单例实例
export const aiService = new AIService();
