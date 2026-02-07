/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 大模型 API 调用服务，支持多供应商
 **/

import { ProviderConfig, APIResponse, ChatMessage } from '@/types';

// 供应商 API 基础 URL 映射
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
};

/**
 * AI API 服务类
 */
class AIService {
  /**
   * 调用 OpenAI 兼容的 API（OpenAI、DeepSeek 等）
   */
  private async callOpenAICompatible(
    config: ProviderConfig,
    messages: { role: string; content: string }[],
    onStream?: (chunk: string) => void
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
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              fullContent += content;
              onStream(content);
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
   */
  async chat(
    config: ProviderConfig,
    messages: ChatMessage[],
    systemPrompt?: string,
    onStream?: (chunk: string) => void
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

    return this.callOpenAICompatible(config, formattedMessages, onStream);
  }

  /**
   * 生成页面总结
   * @param config - 供应商配置
   * @param pageContent - 页面内容
   * @param onStream - 流式响应回调
   */
  async summarize(
    config: ProviderConfig,
    pageContent: string,
    onStream?: (chunk: string) => void
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

    return this.chat(config, messages, systemPrompt, onStream);
  }
}

// 导出单例实例
export const aiService = new AIService();
