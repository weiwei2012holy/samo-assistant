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

/** 已从 storage 加载过的 url 集合，避免重复读取 */
const hydratedUrls = new Set<string>();

function chatStorageKey(url: string): string {
  // 去掉 fragment，避免 #hash 造成同页面不同 key
  try {
    const u = new URL(url);
    u.hash = '';
    return `chat_messages_${u.toString()}`;
  } catch {
    return `chat_messages_${url}`;
  }
}

/** 将对话消息持久化到 chrome.storage.local，供模式切换/刷新后恢复 */
function persistMessages(url: string, messages: ChatMessage[]): void {
  const key = chatStorageKey(url);
  console.log('[useChat] 写入 storage', { key, count: messages.length });
  chrome.storage.local.set({ [key]: messages }).then(() => {
    console.log('[useChat] 写入 storage 成功', { key, count: messages.length });
  }).catch((err) => {
    console.error('持久化对话记录失败:', err);
  });
}

/** 清除指定 URL 的持久化记录 */
function clearPersistedMessages(url: string): void {
  chrome.storage.local.remove(chatStorageKey(url));
}

/** 从 chrome.storage.local 异步加载指定 URL 的对话记录 */
async function loadPersistedMessages(url: string): Promise<ChatMessage[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(chatStorageKey(url), (result) => {
      const saved = result?.[chatStorageKey(url)];
      resolve(Array.isArray(saved) ? saved : []);
    });
  });
}

/**
 * 监听标签页关闭事件，自动清理内存中的对话状态，防止内存泄漏
 * URL 级别的持久化记录不在此清除，让用户再次打开同一 URL 时仍能恢复
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  tabChatStates.delete(tabId);
  loadingTabs.delete(tabId);
  tabStreamingStates.delete(tabId);
});

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
  tabId: number | null = null,
  currentUrl: string | null = null
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
  // storage 里读到的历史记录（尚未恢复到当前会话），供用户手动恢复
  const [savedMessages, setSavedMessages] = useState<ChatMessage[]>([]);

  // AbortController 用于取消请求
  const abortControllerRef = useRef<AbortController | null>(null);

  // 跟踪最新 tabId 和 URL，供异步回调中判断是否仍在原 tab/URL
  const tabIdRef = useRef(tabId);
  const currentUrlRef = useRef(currentUrl);

  // 当 tabId 或 URL 变化时，加载对应的对话状态
  useEffect(() => {
    tabIdRef.current = tabId;
    currentUrlRef.current = currentUrl;

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setStreamingContent('');
    setIsLoading(false);
    setSavedMessages([]);

    if (tabId === null || currentUrl === null) {
      console.log('[useChat] tabId 或 currentUrl 为 null，跳过加载', { tabId, currentUrl });
      return;
    }

    // 内存中已有该 tab 的记录（同一会话内切换回来），直接加载
    if (hydratedUrls.has(currentUrl) && tabChatStates.has(tabId)) {
      const state = getTabState();
      console.log('[useChat] 从内存恢复', { url: currentUrl, count: state.messages.length });
      setMessages(state.messages);
      setError(state.error);
      if (loadingTabs.has(tabId)) {
        setIsLoading(true);
        const savedStreaming = tabStreamingStates.get(tabId);
        if (savedStreaming) setStreamingContent(savedStreaming);
      }
      return;
    }

    // 首次加载该 URL：从 storage 读取历史记录，不自动恢复，等待用户确认
    console.log('[useChat] 首次加载 URL，读取 storage', { url: currentUrl, key: chatStorageKey(currentUrl) });
    hydratedUrls.add(currentUrl);
    loadPersistedMessages(currentUrl).then((persisted) => {
      console.log('[useChat] storage 读取结果', { url: currentUrl, count: persisted.length, persisted });
      if (tabIdRef.current !== tabId || currentUrlRef.current !== currentUrl) {
        console.log('[useChat] tab/url 已切换，丢弃 storage 结果');
        return;
      }
      if (persisted.length > 0) {
        // 有历史记录：暂存到 savedMessages，由用户点击恢复
        setSavedMessages(persisted);
      }
    });
  }, [tabId, currentUrl, getTabState]);

  // 保存当前 tab 的对话状态，同时按 URL 持久化
  const saveTabState = useCallback((newMessages: ChatMessage[], newError: string | null) => {
    if (tabId !== null) {
      tabChatStates.set(tabId, { messages: newMessages, error: newError });
      if (currentUrl !== null) {
        persistMessages(currentUrl, newMessages);
      }
    }
  }, [tabId, currentUrl]);

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

  // 清除聊天历史（同时清除该 URL 的持久化记录）
  const clearMessages = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (tabId !== null) {
      loadingTabs.delete(tabId);
      tabStreamingStates.delete(tabId);
      tabChatStates.delete(tabId);
    }
    if (currentUrl !== null) {
      hydratedUrls.delete(currentUrl);
      clearPersistedMessages(currentUrl);
    }
    setMessages([]);
    setError(null);
    setStreamingContent('');
    setIsLoading(false);
  }, [tabId, currentUrl]);

  // 将 savedMessages 恢复为当前会话（用户主动触发）
  const restoreMessages = useCallback(() => {
    if (savedMessages.length === 0 || tabId === null) return;
    tabChatStates.set(tabId, { messages: savedMessages, error: null });
    setMessages(savedMessages);
    setError(null);
    setSavedMessages([]);
  }, [savedMessages, tabId]);

  // 忽略历史记录（只关闭提示，不删除 storage，下次打开仍可恢复）
  const dismissSavedMessages = useCallback(() => {
    setSavedMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    error,
    streamingContent,
    sendMessage,
    summarizePage,
    clearMessages,
    savedMessages,
    restoreMessages,
    dismissSavedMessages,
  };
}
