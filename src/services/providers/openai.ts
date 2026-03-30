/**
 * @Author wei
 * @Date 2026-03-30
 * @Description OpenAI 兼容协议供应商实现
 **/

import { ProviderConfig, APIResponse, ChatMessage } from '@/types';
import { getProviderBaseUrl } from '@/config/providers';
import { readSSEStream } from '@/utils/stream';
import { AIProvider } from './index';

/**
 * OpenAI 兼容协议供应商
 */
export class OpenAIProvider implements AIProvider {
  /**
   * 发送聊天请求
   */
  async chat(
    config: ProviderConfig,
    messages: ChatMessage[],
    systemPrompt?: string,
    onStream?: (chunk: string) => void,
    enableReasoning: boolean = false
  ): Promise<APIResponse> {
    const baseUrl = config.baseUrl || getProviderBaseUrl(config.provider);
    const url = `${baseUrl}/chat/completions`;

    // 构建消息列表
    const formattedMessages: { role: string; content: string }[] = [];
    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }
    formattedMessages.push(
      ...messages.map(m => ({
        role: m.role,
        content: m.content,
      }))
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: formattedMessages,
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
      let fullReasoning = '';
      let reasoningEnded = false;

      await readSSEStream(response.body, (parsed) => {
        const delta = (parsed as { choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }> })
          .choices?.[0]?.delta;

        // 处理 DeepSeek Reasoner 的思考内容（仅在启用思考模式时显示）
        if (enableReasoning) {
          const reasoningContent = delta?.reasoning_content || '';
          if (reasoningContent) {
            // 首次输出思考内容时，添加开始标记
            if (!fullReasoning) onStream('<think>\n');
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
      });

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
}
