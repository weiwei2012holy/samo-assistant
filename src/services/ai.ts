/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 大模型 API 调用服务，支持多供应商
 **/

import { ProviderConfig, APIResponse, ChatMessage, OpenRouterModel } from '@/types';

// 供应商 API 基础 URL 映射
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

/**
 * AI API 服务类
 */
class AIService {
  /**
   * 调用 OpenAI 兼容的 API（OpenAI、DeepSeek 等）
   * @param config - 供应商配置
   * @param messages - 消息列表
   * @param onStream - 流式响应回调
   * @param enableReasoning - 是否启用思考模式
   */
  private async callOpenAICompatible(
    config: ProviderConfig,
    messages: { role: string; content: string }[],
    onStream?: (chunk: string) => void,
    enableReasoning: boolean = false
  ): Promise<APIResponse> {
    const baseUrl = config.baseUrl || PROVIDER_BASE_URLS[config.provider] || PROVIDER_BASE_URLS.openai;
    const url = `${baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: !!onStream,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API 请求失败: ${response.status}`);
    }

    // 流式响应处理
    if (onStream && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let fullReasoning = '';
      let reasoningEnded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

        for (const line of lines) {
          const data = line.replace(/^data:\s*/, '');
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            // 处理 DeepSeek Reasoner 的思考内容（仅在启用思考模式时显示）
            if (enableReasoning) {
              const reasoningContent = delta?.reasoning_content || '';
              if (reasoningContent) {
                // 首次输出思考内容时，添加开始标记
                if (!fullReasoning) {
                  onStream('<think>\n');
                }
                fullReasoning += reasoningContent;
                onStream(reasoningContent);
              }
            }

            // 处理普通内容
            const content = delta?.content || '';
            if (content) {
              // 思考结束，输出结束标记（仅在启用思考模式且有思考内容时）
              if (enableReasoning && fullReasoning && !reasoningEnded) {
                reasoningEnded = true;
                onStream('\n</think>\n\n');
              }
              fullContent += content;
              onStream(content);
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      // 如果只有思考内容没有普通内容，也要关闭标签
      if (enableReasoning && fullReasoning && !reasoningEnded) {
        onStream('\n</think>\n');
      }

      // 返回完整内容（包含思考过程，仅在启用时）
      const finalContent = enableReasoning && fullReasoning
        ? `<think>\n${fullReasoning}\n</think>\n\n${fullContent}`
        : fullContent;
      return { content: finalContent };
    }

    // 非流式响应
    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }

  /**
   * 调用 Anthropic API
   */
  private async callAnthropic(
    config: ProviderConfig,
    messages: { role: string; content: string }[],
    systemPrompt?: string,
    onStream?: (chunk: string) => void
  ): Promise<APIResponse> {
    const baseUrl = config.baseUrl || PROVIDER_BASE_URLS.anthropic;
    const url = `${baseUrl}/messages`;

    // 转换消息格式，Anthropic 不支持 system 角色在 messages 中
    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: anthropicMessages,
        stream: !!onStream,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API 请求失败: ${response.status}`);
    }

    // 流式响应处理
    if (onStream && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

        for (const line of lines) {
          const data = line.replace(/^data:\s*/, '');

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta') {
              const content = parsed.delta?.text || '';
              if (content) {
                fullContent += content;
                onStream(content);
              }
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      return { content: fullContent };
    }

    // 非流式响应
    const data = await response.json();
    return {
      content: data.content?.[0]?.text || '',
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      } : undefined,
    };
  }

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
    // 构建消息列表
    const formattedMessages: { role: string; content: string }[] = [];

    if (systemPrompt && config.provider !== 'anthropic') {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }

    formattedMessages.push(
      ...messages.map(m => ({
        role: m.role,
        content: m.content,
      }))
    );

    // 根据供应商选择不同的 API 调用方式
    if (config.provider === 'anthropic') {
      return this.callAnthropic(config, formattedMessages, systemPrompt, onStream);
    }

    return this.callOpenAICompatible(config, formattedMessages, onStream, enableReasoning);
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
