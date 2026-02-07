/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 聊天 Hook，管理聊天状态和消息
 **/

import { useState, useCallback } from 'react';
import { ChatMessage, ProviderConfig } from '@/types';
import { aiService } from '@/services/ai';

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 聊天管理 Hook
 * @param providerConfig - 供应商配置
 * @returns 聊天状态和操作方法
 */
export function useChat(providerConfig: ProviderConfig) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');

  // 发送消息
  const sendMessage = useCallback(async (
    content: string,
    pageContext?: string
  ) => {
    if (!content.trim()) return;

    // 添加用户消息
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      createdAt: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);
    setStreamingContent('');

    try {
      // 构建系统提示词
      let systemPrompt = '你是一个智能助手，帮助用户理解和分析网页内容。请用中文回复。';
      if (pageContext) {
        systemPrompt += `\n\n当前网页内容摘要：\n${pageContext.slice(0, 10000)}`;
      }

      // 获取所有消息用于上下文
      const allMessages = [...messages, userMessage];

      // 流式响应处理
      let fullContent = '';
      const response = await aiService.chat(
        providerConfig,
        allMessages,
        systemPrompt,
        (chunk) => {
          fullContent += chunk;
          setStreamingContent(fullContent);
        }
      );

      // 添加助手消息
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response.content || fullContent,
        createdAt: Date.now(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      setStreamingContent('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 响应失败';
      setError(message);
      console.error('发送消息失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, [messages, providerConfig]);

  // 生成页面总结
  const summarizePage = useCallback(async (pageContent: string) => {
    setIsLoading(true);
    setError(null);
    setStreamingContent('');

    try {
      // 添加系统消息表示开始总结
      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: '请总结这个页面的内容',
        createdAt: Date.now(),
      };

      setMessages([userMessage]);

      // 流式响应处理
      let fullContent = '';
      const response = await aiService.summarize(
        providerConfig,
        pageContent,
        (chunk) => {
          fullContent += chunk;
          setStreamingContent(fullContent);
        }
      );

      // 添加总结结果
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response.content || fullContent,
        createdAt: Date.now(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      setStreamingContent('');
    } catch (err) {
      const message = err instanceof Error ? err.message : '总结失败';
      setError(message);
      console.error('总结页面失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, [providerConfig]);

  // 清除聊天历史
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setStreamingContent('');
  }, []);

  return {
    messages,
    isLoading,
    error,
    streamingContent,
    sendMessage,
    summarizePage,
    clearMessages,
  };
}
