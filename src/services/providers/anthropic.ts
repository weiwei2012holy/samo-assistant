/**
 * @Author wei
 * @Date 2026-03-30
 * @Description Anthropic 协议供应商实现
 **/

import { ProviderConfig, APIResponse, ChatMessage } from '@/types';
import { getProviderBaseUrl } from '@/config/providers';
import { readSSEStream } from '@/utils/stream';
import { AIProvider } from './index';

/**
 * Anthropic 协议供应商
 */
export class AnthropicProvider implements AIProvider {
  /**
   * 发送聊天请求
   */
  async chat(
    config: ProviderConfig,
    messages: ChatMessage[],
    systemPrompt?: string,
    onStream?: (chunk: string) => void
  ): Promise<APIResponse> {
    const baseUrl = config.baseUrl || getProviderBaseUrl('anthropic');
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
      let fullContent = '';

      await readSSEStream(response.body, (parsed) => {
        const event = parsed as { type?: string; delta?: { text?: string } };
        if (event.type === 'content_block_delta') {
          const content = event.delta?.text || '';
          if (content) {
            fullContent += content;
            onStream(content);
          }
        }
      });

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
}
