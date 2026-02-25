/**
 * @Author wei
 * @Date 2026-02-24
 * @Description 标签页生命周期管理 Hook
 *
 * 监听 Chrome 标签页的激活事件和 URL 变化事件，维护侧边栏当前关联的 tabId，
 * 并在变化时通知 background service worker。
 **/

import { useEffect, useRef } from 'react';

interface UseTabManagerOptions {
  /** 当前关联的标签页 ID（由 App.tsx 管理） */
  currentTabId: number | null;
  /** 更新关联的标签页 ID */
  onSetTabId: (tabId: number) => void;
  /** 切换到其他标签页时触发（不含 URL 变化） */
  onTabSwitch: () => void;
  /** 当前标签页 URL 加载完成时触发 */
  onUrlChange: () => void;
}

/**
 * 管理侧边栏关联的标签页，监听激活和 URL 变化事件。
 *
 * - 使用 callback ref 模式：onSetTabId / onTabSwitch / onUrlChange 的最新引用
 *   通过 ref 传递给监听器，避免因回调引用变化而重复注册 Chrome 事件监听器
 * - currentTabIdRef 让激活监听器始终读取最新 tabId，
 *   无需将 currentTabId 加入 useEffect 依赖数组
 */
export function useTabManager({
  currentTabId,
  onSetTabId,
  onTabSwitch,
  onUrlChange,
}: UseTabManagerOptions): void {
  // --- callback refs：始终持有最新引用，监听器不随回调变化而重注册 ---
  const currentTabIdRef = useRef<number | null>(currentTabId);
  const onSetTabIdRef = useRef(onSetTabId);
  const onTabSwitchRef = useRef(onTabSwitch);
  const onUrlChangeRef = useRef(onUrlChange);

  // 每次渲染后同步 ref（不触发额外渲染）
  useEffect(() => { onSetTabIdRef.current = onSetTabId; });
  useEffect(() => { onTabSwitchRef.current = onTabSwitch; });
  useEffect(() => { onUrlChangeRef.current = onUrlChange; });
  useEffect(() => { currentTabIdRef.current = currentTabId; }, [currentTabId]);

  // 初始化：获取当前激活的标签页
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) onSetTabIdRef.current(tab.id);
    });
  }, []);

  // 监听标签页激活事件（空依赖 → 仅注册一次）
  useEffect(() => {
    const handler = (activeInfo: chrome.tabs.TabActiveInfo) => {
      if (activeInfo.tabId !== currentTabIdRef.current) {
        onSetTabIdRef.current(activeInfo.tabId);
        onTabSwitchRef.current();
      }
    };
    chrome.tabs.onActivated.addListener(handler);
    return () => chrome.tabs.onActivated.removeListener(handler);
  }, []);

  // 监听标签页 URL 更新事件（空依赖 → 仅注册一次）
  useEffect(() => {
    const handler = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (tabId === currentTabIdRef.current && changeInfo.status === 'complete') {
        onUrlChangeRef.current();
      }
    };
    chrome.tabs.onUpdated.addListener(handler);
    return () => chrome.tabs.onUpdated.removeListener(handler);
  }, []);

  // 当 tabId 变化时，通知 background 当前侧边栏关联的 tab
  useEffect(() => {
    if (currentTabId !== null) {
      chrome.runtime.sendMessage({
        type: 'SIDEPANEL_TAB_ACTIVE',
        tabId: currentTabId,
      }).catch(() => {
        // 忽略：background 可能尚未就绪
      });
    }
  }, [currentTabId]);
}
