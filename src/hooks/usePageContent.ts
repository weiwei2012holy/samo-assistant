/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 页面内容 Hook，获取当前标签页内容
 **/

import { useState, useCallback } from 'react';
import { PageContent } from '@/types';

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

      // 向 content script 发送消息获取页面内容
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONTENT' });

      if (response.error) {
        throw new Error(response.error);
      }

      setPageContent(response);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取页面内容失败';
      setError(message);
      console.error('获取页面内容失败:', err);
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
