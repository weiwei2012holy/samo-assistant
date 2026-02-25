/**
 * @Author wei
 * @Date 2026-02-24
 * @Description 待执行任务调度 Hook - 排他锁 + 延迟执行
 *
 * 负责：
 *  1. 维护排他执行锁，确保同一时间只有一个 AI 任务在执行
 *  2. 支持延迟任务队列：summarize_page 在页面内容未就绪时入队，内容加载后自动执行
 *  3. 监听来自 background 的 EXECUTE_TASK 消息（右键菜单 / 浮窗触发）
 *  4. 侧边栏打开时通过 GET_PENDING_TASK 轮询一次待处理任务
 **/

import { useState, useEffect, useCallback, useRef, RefObject } from 'react';
import { PageContent } from '@/types';

/** 通用任务描述 */
interface Task {
  type: string;
  prompt: string;
  text?: string;
}

interface UsePendingTaskOptions {
  /** 是否正在等待 AI 响应 */
  chatLoading: boolean;
  /** 检查 API 配置是否有效 */
  isConfigValid: () => boolean;
  /** 当前页面内容 */
  pageContent: PageContent | null;
  /** 页面内容是否正在加载 */
  pageLoading: boolean;
  /** 设置是否正在加载 */
  settingsLoading: boolean;
  /** 发送聊天消息 */
  sendMessage: (prompt: string, pageContent?: string) => void;
  /** 触发页面总结 */
  summarizePage: (content: string) => void;
  /** 设置待提问的选中文本（ask 任务使用） */
  setPendingAskText: (text: string | null) => void;
  /** 输入框 ref，用于 ask 任务时自动聚焦 */
  textareaRef: RefObject<HTMLTextAreaElement>;
}

interface UsePendingTaskResult {
  /** 重置任务检查状态和执行锁（在 tab 切换或 URL 变化时调用） */
  resetPendingState: () => void;
}

/**
 * 待执行任务调度 Hook
 *
 * 使用 callback ref 模式持有外部依赖，确保 EXECUTE_TASK 监听器仅注册一次，
 * 同时始终能调用到最新版本的 sendMessage / summarizePage 等函数。
 */
export function usePendingTask({
  chatLoading,
  isConfigValid,
  pageContent,
  pageLoading,
  settingsLoading,
  sendMessage,
  summarizePage,
  setPendingAskText,
  textareaRef,
}: UsePendingTaskOptions): UsePendingTaskResult {
  /** 标记是否已检查过待处理任务，避免重复触发 GET_PENDING_TASK */
  const [pendingTaskChecked, setPendingTaskChecked] = useState(false);

  /** 排他执行锁：确保同一时间只有一个任务在执行 */
  const taskExecutingRef = useRef(false);

  /** 延迟任务队列：等待页面内容加载后执行 */
  const pendingExecuteTaskRef = useRef<Task | null>(null);

  // --- callback refs：始终持有最新的外部依赖，监听器不随依赖变化而重注册 ---
  const chatLoadingRef = useRef(chatLoading);
  const pageContentRef = useRef(pageContent);
  const isConfigValidRef = useRef(isConfigValid);
  const sendMessageRef = useRef(sendMessage);
  const summarizePageRef = useRef(summarizePage);
  const setPendingAskTextRef = useRef(setPendingAskText);

  useEffect(() => { chatLoadingRef.current = chatLoading; });
  useEffect(() => { pageContentRef.current = pageContent; });
  useEffect(() => { isConfigValidRef.current = isConfigValid; });
  useEffect(() => { sendMessageRef.current = sendMessage; });
  useEffect(() => { summarizePageRef.current = summarizePage; });
  useEffect(() => { setPendingAskTextRef.current = setPendingAskText; });

  /**
   * 统一的任务执行入口：
   *  - ask：预填选中文本卡片，等待用户点击常用问题，不直接发送
   *  - summarize_page：页面内容未就绪时入队，内容加载后自动执行
   *  - 其他类型：直接调用 sendMessage
   */
  const executeTask = useCallback((task: Task) => {
    // ask 任务：仅预填文本，聚焦输入框，等待用户操作
    if (task.type === 'ask' && task.text) {
      console.log('ask 任务：预填选中文本，等待用户选择问题', task.text);
      setPendingAskTextRef.current(task.text);
      setTimeout(() => textareaRef.current?.focus(), 100);
      return;
    }

    // 排他检查：如果正在执行任务或正在加载，则跳过
    if (taskExecutingRef.current || chatLoadingRef.current) {
      console.log('任务被跳过：已有任务正在执行');
      return;
    }

    // API 配置有效性检查
    if (!isConfigValidRef.current()) {
      console.warn('API 配置无效，无法执行任务');
      return;
    }

    // summarize_page 且页面内容未就绪：入队等待
    if (task.type === 'summarize_page' && !pageContentRef.current?.content) {
      console.log('页面内容未加载，保存任务等待执行');
      pendingExecuteTaskRef.current = task;
      return;
    }

    // 加锁并执行
    taskExecutingRef.current = true;
    console.log('开始执行任务:', task.type);
    if (task.type === 'summarize_page') {
      summarizePageRef.current(pageContentRef.current!.content);
    } else {
      sendMessageRef.current(task.prompt, pageContentRef.current?.content);
    }
  }, [textareaRef]);

  /** 重置任务检查状态和执行锁（供 tab 切换 / URL 变化时调用） */
  const resetPendingState = useCallback(() => {
    setPendingTaskChecked(false);
    taskExecutingRef.current = false;
    pendingExecuteTaskRef.current = null;
  }, []);

  // chatLoading 结束时重置排他执行锁
  useEffect(() => {
    if (!chatLoading) {
      taskExecutingRef.current = false;
    }
  }, [chatLoading]);

  // 页面内容加载完成后，执行队列中的延迟任务
  useEffect(() => {
    if (pageContent?.content && pendingExecuteTaskRef.current) {
      console.log('页面内容已加载，执行待处理任务');
      const task = pendingExecuteTaskRef.current;
      pendingExecuteTaskRef.current = null;
      executeTask(task);
    }
  }, [pageContent, executeTask]);

  // executeTask ref（供 EXECUTE_TASK 监听器使用，避免重注册）
  const executeTaskRef = useRef(executeTask);
  useEffect(() => { executeTaskRef.current = executeTask; });

  // 监听来自 background 的 EXECUTE_TASK 消息（空依赖 → 仅注册一次）
  useEffect(() => {
    const handleMessage = (message: { type: string; task?: Task }) => {
      if (message.type === 'EXECUTE_TASK' && message.task) {
        console.log('收到 EXECUTE_TASK 消息:', message.task.type);
        // 标记已处理，防止 GET_PENDING_TASK 重复执行同一任务
        setPendingTaskChecked(true);
        // 延迟执行，确保页面内容有时间加载
        setTimeout(() => executeTaskRef.current(message.task!), 100);
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  // 检查 background 中的待处理任务（侧边栏打开时轮询一次）
  useEffect(() => {
    // 已检查过、设置/页面未加载完成 → 跳过
    if (pendingTaskChecked || settingsLoading || pageLoading || !pageContent) return;

    const checkPendingTask = async () => {
      try {
        const task = await chrome.runtime.sendMessage({ type: 'GET_PENDING_TASK' });
        setPendingTaskChecked(true);

        if (!task) return;
        // ask 类型需要 text；其他类型需要 prompt
        if (task.type === 'ask' && !task.text) return;
        if (task.type !== 'ask' && !task.prompt) return;

        console.log('通过 GET_PENDING_TASK 获取到任务:', task.type);
        executeTask(task);
      } catch (error) {
        console.error('获取待处理任务失败:', error);
        setPendingTaskChecked(true);
      }
    };

    checkPendingTask();
  }, [pendingTaskChecked, settingsLoading, pageLoading, pageContent, executeTask]);

  return { resetPendingState };
}
