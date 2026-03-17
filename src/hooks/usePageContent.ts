/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 页面内容 Hook，获取当前标签页内容
 **/

import { useState, useCallback } from 'react';
import { PageContent } from '@/types';

/** content script 连接失败的错误关键字 */
const CONNECTION_ERROR = 'Could not establish connection';

/**
 * 向指定 tab 的主框架发送消息，失败时自动重试一次。
 * 场景：侧边栏比 content script 先就绪（页面刚完成导航）时，
 * 等待 600ms 后重试通常即可成功。
 */
async function sendMessageWithRetry(
  tabId: number,
  message: { type: string }
): Promise<PageContent & { error?: string }> {
  try {
    // 指定 frameId: 0 确保只从主框架获取，避免 iframe（如 reCAPTCHA）抢先响应
    return await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (!msg.includes(CONNECTION_ERROR)) throw err;

    // content script 尚未就绪，等待后重试一次
    await new Promise(resolve => setTimeout(resolve, 600));
    return await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
  }
}

/**
 * 页面内容 Hook
 * @returns 页面内容状态和获取方法
 */
export function usePageContent() {
  const [pageContent, setPageContent] = useState<PageContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取当前页面内容
  const fetchPageContent = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 获取当前活动标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id) {
        throw new Error('无法获取当前标签页');
      }

      const response = await sendMessageWithRetry(tab.id, { type: 'EXTRACT_CONTENT' });

      if (response.error) {
        throw new Error(response.error);
      }

      setPageContent(response);
      return response;
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : '获取页面内容失败';
      // 将 Chrome 内部错误转换为对用户友好的提示
      const message = rawMessage.includes(CONNECTION_ERROR)
        ? '此页面不支持内容提取（如 Chrome 系统页面、PDF 或扩展页面）'
        : rawMessage;
      setError(message);
      console.warn('获取页面内容失败:', rawMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // 清除页面内容
  const clearPageContent = useCallback(() => {
    setPageContent(null);
    setError(null);
  }, []);

  return {
    pageContent,
    loading,
    error,
    fetchPageContent,
    clearPageContent,
  };
}
