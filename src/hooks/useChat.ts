/**
 * @Author wei
 * @Date 2026-07-16
 * @Description 聊天 Hook，管理聊天状态和消息，支持按 tabId 隔离对话与独立 AbortController 的多 tab 并发 AI 生成
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
  suggestedQuestions?: string[];
}

// 全局存储各 tab 的对话状态
const tabChatStates = new Map<number, TabChatState>();

// 正在进行 AI 请求的 tab 集合（切换回来时恢复加载指示）
const loadingTabs = new Set<number>();

// 各 tab 当前流式输出的已积累内容（切换回来时恢复进度）
const tabStreamingStates = new Map<number, string>();

/**
 * 容错性解析 JSON 的辅助函数，尝试从各类包裹或非规范格式中恢复追问问题数组
 */
function parseQuestionsFromJson(content: string): string[] {
  const text = content.trim();
  try {
    // 移除 markdown 代码块包裹
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, 3).map(q => String(q).trim());
    }
  } catch {
    // 正则匹配作为后备容错：匹配 ["..."] 或列表样式
    const matched = text.match(/(?<=\d\.\s*|[-*]\s*)[^\n\r]+|(?<=")[^",\n\r]+(?=")/g);
    if (matched && matched.length >= 3) {
      return matched.map(q => q.trim()).slice(0, 3);
    }
  }
  return [];
}

/** 已从 storage 加载过的 url 集合，避免重复读取 */
const hydratedUrls = new Set<string>();

/** 存储每个 tab 当前的 AbortController，用于控制多 tab 并发请求独立取消 */
const tabAbortControllers = new Map<number, AbortController>();

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
  currentUrl: string | null = null,
  enableSuggestedQuestions: boolean = true
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
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(() => getTabState().suggestedQuestions || []);
  // storage 里读到的历史记录（尚未恢复到当前会话），供用户手动恢复
  const [savedMessages, setSavedMessages] = useState<ChatMessage[]>([]);

  // 跟踪最新 tabId 和 URL，供异步回调中判断是否仍在原 tab/URL
  const tabIdRef = useRef(tabId);
  const currentUrlRef = useRef(currentUrl);

  // 当 tabId 或 URL 变化时，加载对应的对话状态
  useEffect(() => {
    tabIdRef.current = tabId;
    currentUrlRef.current = currentUrl;

    setStreamingContent('');
    setIsLoading(false);
    setSuggestedQuestions([]);
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
      setSuggestedQuestions(state.suggestedQuestions || []);
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
  const saveTabState = useCallback((newMessages: ChatMessage[], newError: string | null, newQuestions?: string[]) => {
    if (tabId !== null) {
      const existing = tabChatStates.get(tabId);
      const questions = newQuestions !== undefined ? newQuestions : (existing?.suggestedQuestions || []);
      tabChatStates.set(tabId, { messages: newMessages, error: newError, suggestedQuestions: questions });
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

    // 取消当前 tab 之前正在进行的请求，并创建该 tab 独享的 AbortController
    const myController = new AbortController();
    if (requestTabId !== null) {
      const prevController = tabAbortControllers.get(requestTabId);
      if (prevController) {
        prevController.abort();
      }
      tabAbortControllers.set(requestTabId, myController);
    }

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
    setSuggestedQuestions([]);

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
          if (myController.signal.aborted) return;
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
      if (myController.signal.aborted) return;

      // 添加助手消息
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response.content || fullContent,
        createdAt: Date.now(),
      };

      // 已切换到其他 tab：直接写入 Map 保留历史，不更新当前可见视图并异步生成引导问题
      if (tabIdRef.current !== requestTabId) {
        if (requestTabId !== null) {
          const state = tabChatStates.get(requestTabId) || { messages: [], error: null };
          const updatedMessages = [...state.messages, assistantMessage];
          tabChatStates.set(requestTabId, {
            messages: updatedMessages,
            error: null,
            suggestedQuestions: state.suggestedQuestions,
          });
          generateSuggestedQuestions(updatedMessages, pageContext);
        }
        return;
      }

      updateMessages(prev => [...prev, assistantMessage]);
      setStreamingContent('');
      generateSuggestedQuestions([...currentMessages, assistantMessage], pageContext);
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
        if (tabAbortControllers.get(requestTabId) === myController) {
          tabAbortControllers.delete(requestTabId);
        }
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

    // 取消当前 tab 之前正在进行的请求，并创建该 tab 独享的 AbortController
    const myController = new AbortController();
    if (requestTabId !== null) {
      const prevController = tabAbortControllers.get(requestTabId);
      if (prevController) {
        prevController.abort();
      }
      tabAbortControllers.set(requestTabId, myController);
    }

    // 标记该 tab 有正在进行的请求
    if (requestTabId !== null) loadingTabs.add(requestTabId);

    setIsLoading(true);
    setError(null);
    setStreamingContent('');
    setSuggestedQuestions([]);

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
          if (myController.signal.aborted) return;
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
      if (myController.signal.aborted) return;

      // 添加总结结果
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response.content || fullContent,
        createdAt: Date.now(),
      };

      // 已切换到其他 tab：只写入 Map，不更新当前可见视图并异步生成引导问题
      if (tabIdRef.current !== requestTabId) {
        if (requestTabId !== null) {
          const state = tabChatStates.get(requestTabId) || { messages: [], error: null };
          const updatedMessages = [...state.messages, assistantMessage];
          tabChatStates.set(requestTabId, {
            messages: updatedMessages,
            error: null,
            suggestedQuestions: state.suggestedQuestions,
          });
          generateSuggestedQuestions(updatedMessages, pageContent);
        }
        return;
      }

      updateMessages(prev => [...prev, assistantMessage]);
      setStreamingContent('');
      generateSuggestedQuestions([userMessage, assistantMessage], pageContent);
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
        if (tabAbortControllers.get(requestTabId) === myController) {
          tabAbortControllers.delete(requestTabId);
        }
      }
      // 只有仍在原 tab 时才重置加载状态
      if (tabIdRef.current === requestTabId) {
        setIsLoading(false);
      }
    }
  }, [tabId, providerConfig, enableReasoning, updateMessages, saveTabState]);

  // 异步生成引导性问题
  const generateSuggestedQuestions = useCallback(async (
    history: ChatMessage[],
    pageContext?: string
  ) => {
    if (!enableSuggestedQuestions || history.length === 0) return;
    const requestTabId = tabId;

    try {
      let suggestSystemPrompt = `你是一个智能追问生成助手。请基于当前网页的内容摘要（若有）以及刚刚的对话历史，生成三个用户接下来最可能想继续提问的、具有针对性的后续问题。
返回要求：
1. 必须是中文，且表述要极其简洁、自然，像用户的真实口吻。
2. 每一个问题必须控制在 22 个字以内，并且必须是疑问句。
3. 必须严格以 JSON 数组格式返回，例如：["问题 1", "问题 2", "问题 3"]。不要包含任何 Markdown 语法标记（如 \`\`\`json），以及任何多余的前言、后记或解释。`;

      if (pageContext) {
        suggestSystemPrompt += `\n\n当前网页内容摘要：\n${pageContext.slice(0, 5000)}`;
      }

      const lastMessage = history[history.length - 1];
      if (lastMessage?.role !== 'assistant') return;

      const response = await aiService.chat(
        providerConfig,
        history,
        suggestSystemPrompt,
        undefined, // 非流式
        false // 无需开启思考模式
      );

      // 已切换到其他 tab：只写入 Map，不更新当前可见视图
      if (tabIdRef.current !== requestTabId) {
        if (requestTabId !== null) {
          const state = tabChatStates.get(requestTabId);
          if (state) {
            tabChatStates.set(requestTabId, {
              ...state,
              suggestedQuestions: parseQuestionsFromJson(response.content)
            });
          }
        }
        return;
      }

      const questions = parseQuestionsFromJson(response.content);
      if (questions.length > 0) {
        setSuggestedQuestions(questions);
        if (requestTabId !== null) {
          const state = tabChatStates.get(requestTabId);
          if (state) {
            tabChatStates.set(requestTabId, { ...state, suggestedQuestions: questions });
          }
        }
      }
    } catch (err) {
      console.warn('生成猜你想问引导问题失败:', err);
    }
  }, [tabId, providerConfig, enableSuggestedQuestions]);

  // 清除聊天历史（同时清除该 URL 的持久化记录）
  const clearMessages = useCallback(() => {
    if (tabId !== null) {
      const controller = tabAbortControllers.get(tabId);
      if (controller) {
        controller.abort();
        tabAbortControllers.delete(tabId);
      }
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
    suggestedQuestions,
    sendMessage,
    summarizePage,
    clearMessages,
    savedMessages,
    restoreMessages,
    dismissSavedMessages,
  };
}
