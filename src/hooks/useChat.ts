/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 聊天 Hook，管理聊天状态和消息，支持按 tabId 隔离对话
 **/

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatMessage, ProviderConfig } from '@/types';
import { aiService } from '@/services/ai';

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Tab 对话状态
 */
interface TabChatState {
  messages: ChatMessage[];
  error: string | null;
}

// 全局存储各 tab 的对话状态
const tabChatStates = new Map<number, TabChatState>();

// 正在进行 AI 请求的 tab 集合（切换回来时恢复加载指示）
const loadingTabs = new Set<number>();

// 各 tab 当前流式输出的已积累内容（切换回来时恢复进度）
const tabStreamingStates = new Map<number, string>();

/**
 * 聊天管理 Hook
 * @param providerConfig - 供应商配置
 * @param enableReasoning - 是否启用思考模式
 * @param tabId - 当前标签页 ID
 * @returns 聊天状态和操作方法
 */
export function useChat(
  providerConfig: ProviderConfig,
  enableReasoning: boolean = false,
  tabId: number | null = null
) {
  // 从全局状态获取当前 tab 的对话，或使用空数组
  const getTabState = useCallback((): TabChatState => {
    if (tabId === null) {
      return { messages: [], error: null };
    }
    return tabChatStates.get(tabId) || { messages: [], error: null };
  }, [tabId]);

  const [messages, setMessages] = useState<ChatMessage[]>(() => getTabState().messages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => getTabState().error);
  const [streamingContent, setStreamingContent] = useState('');

  // AbortController 用于取消请求
  const abortControllerRef = useRef<AbortController | null>(null);

  // 跟踪最新 tabId，供异步回调中判断是否仍在原 tab
  // 使用 ref 而非直接捕获闭包，确保回调拿到的始终是最新值
  const tabIdRef = useRef(tabId);

  // 当 tabId 变化时，加载对应 tab 的对话状态，并取消之前的请求
  useEffect(() => {
    // 同步更新 ref，确保所有异步回调都能感知 tab 切换
    tabIdRef.current = tabId;

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 先重置为默认空状态
    setStreamingContent('');
    setIsLoading(false);

    // 加载当前 tab 的对话状态
    const state = getTabState();
    setMessages(state.messages);
    setError(state.error);

    // 若该 tab 有正在进行的请求，恢复加载状态与已积累的流式内容，
    // 避免切换回来后出现"空白等待"
    if (tabId !== null && loadingTabs.has(tabId)) {
      setIsLoading(true);
      const savedStreaming = tabStreamingStates.get(tabId);
      if (savedStreaming) setStreamingContent(savedStreaming);
    }
  }, [tabId, getTabState]);

  // 保存当前 tab 的对话状态
  const saveTabState = useCallback((newMessages: ChatMessage[], newError: string | null) => {
    if (tabId !== null) {
      tabChatStates.set(tabId, { messages: newMessages, error: newError });
    }
  }, [tabId]);

  // 更新消息并保存状态
  const updateMessages = useCallback((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setMessages(prev => {
      const newMessages = updater(prev);
      saveTabState(newMessages, error);
      return newMessages;
    });
  }, [saveTabState, error]);

  // 发送消息
  const sendMessage = useCallback(async (
    content: string,
    pageContext?: string
  ) => {
    if (!content.trim()) return;

    // 快照本次请求时的 tabId，用于异步完成后判断是否仍在同一 tab
    const requestTabId = tabId;

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // 标记该 tab 有正在进行的请求
    if (requestTabId !== null) loadingTabs.add(requestTabId);

    // 添加用户消息
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      createdAt: Date.now(),
    };

    const currentMessages = [...messages, userMessage];
    updateMessages(() => currentMessages);
    setIsLoading(true);
    setError(null);
    setStreamingContent('');

    try {
      // 构建系统提示词
      let systemPrompt = '你是一个智能助手，帮助用户理解和分析网页内容。请用中文回复。';
      if (pageContext) {
        systemPrompt += `\n\n当前网页内容摘要：\n${pageContext.slice(0, 10000)}`;
      }

      // 流式响应处理
      let fullContent = '';
      const response = await aiService.chat(
        providerConfig,
        currentMessages,
        systemPrompt,
        (chunk) => {
          // 检查是否已取消
          if (abortControllerRef.current?.signal.aborted) return;
          // 无论是否在当前 tab，都先积累内容并保存进度
          fullContent += chunk;
          if (requestTabId !== null) tabStreamingStates.set(requestTabId, fullContent);
          // 仅在当前 tab 时更新流式视图，避免内容跨 tab 污染
          if (tabIdRef.current !== requestTabId) return;
          setStreamingContent(fullContent);
        },
        enableReasoning
      );

      // 检查是否已取消
      if (abortControllerRef.current?.signal.aborted) return;

      // 添加助手消息
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response.content || fullContent,
        createdAt: Date.now(),
      };

      // 已切换到其他 tab：直接写入 Map 保留历史，不更新当前可见视图
      if (tabIdRef.current !== requestTabId) {
        if (requestTabId !== null) {
          const state = tabChatStates.get(requestTabId) || { messages: [], error: null };
          tabChatStates.set(requestTabId, {
            messages: [...state.messages, assistantMessage],
            error: null,
          });
        }
        return;
      }

      updateMessages(prev => [...prev, assistantMessage]);
      setStreamingContent('');
    } catch (err) {
      // 忽略取消错误
      if (err instanceof Error && err.name === 'AbortError') return;
      // 已切换 tab，不污染当前 tab 的错误状态
      if (tabIdRef.current !== requestTabId) return;
      const message = err instanceof Error ? err.message : 'AI 响应失败';
      setError(message);
      saveTabState(messages, message);
      console.error('发送消息失败:', err);
    } finally {
      // 清理该 tab 的进行中状态
      if (requestTabId !== null) {
        loadingTabs.delete(requestTabId);
        tabStreamingStates.delete(requestTabId);
      }
      // 只有仍在原 tab 时才重置加载状态，避免打断其他 tab 正在进行的请求
      if (tabIdRef.current === requestTabId) {
        setIsLoading(false);
      }
    }
  }, [tabId, messages, providerConfig, enableReasoning, updateMessages, saveTabState]);

  // 生成页面总结
  const summarizePage = useCallback(async (pageContent: string) => {
    // 快照本次请求时的 tabId
    const requestTabId = tabId;

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // 标记该 tab 有正在进行的请求
    if (requestTabId !== null) loadingTabs.add(requestTabId);

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

      const initialMessages = [userMessage];
      updateMessages(() => initialMessages);

      // 流式响应处理
      let fullContent = '';
      const response = await aiService.summarize(
        providerConfig,
        pageContent,
        (chunk) => {
          // 检查是否已取消
          if (abortControllerRef.current?.signal.aborted) return;
          // 无论是否在当前 tab，都先积累内容并保存进度
          fullContent += chunk;
          if (requestTabId !== null) tabStreamingStates.set(requestTabId, fullContent);
          // 仅在当前 tab 时更新流式视图
          if (tabIdRef.current !== requestTabId) return;
          setStreamingContent(fullContent);
        },
        enableReasoning
      );

      // 检查是否已取消
      if (abortControllerRef.current?.signal.aborted) return;

      // 添加总结结果
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response.content || fullContent,
        createdAt: Date.now(),
      };

      // 已切换到其他 tab：只写入 Map，不更新当前可见视图
      if (tabIdRef.current !== requestTabId) {
        if (requestTabId !== null) {
          const state = tabChatStates.get(requestTabId) || { messages: [], error: null };
          tabChatStates.set(requestTabId, {
            messages: [...state.messages, assistantMessage],
            error: null,
          });
        }
        return;
      }

      updateMessages(prev => [...prev, assistantMessage]);
      setStreamingContent('');
    } catch (err) {
      // 忽略取消错误
      if (err instanceof Error && err.name === 'AbortError') return;
      // 已切换 tab，不污染当前 tab 的错误状态
      if (tabIdRef.current !== requestTabId) return;
      const message = err instanceof Error ? err.message : '总结失败';
      setError(message);
      saveTabState([], message);
      console.error('总结页面失败:', err);
    } finally {
      // 清理该 tab 的进行中状态
      if (requestTabId !== null) {
        loadingTabs.delete(requestTabId);
        tabStreamingStates.delete(requestTabId);
      }
      // 只有仍在原 tab 时才重置加载状态
      if (tabIdRef.current === requestTabId) {
        setIsLoading(false);
      }
    }
  }, [tabId, providerConfig, enableReasoning, updateMessages, saveTabState]);

  // 清除聊天历史
  const clearMessages = useCallback(() => {
    // 取消正在进行的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // 清理进行中状态
    if (tabId !== null) {
      loadingTabs.delete(tabId);
      tabStreamingStates.delete(tabId);
    }
    setMessages([]);
    setError(null);
    setStreamingContent('');
    setIsLoading(false);
    saveTabState([], null);
  }, [tabId, saveTabState]);

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
