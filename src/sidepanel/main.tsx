/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 侧边栏入口文件
 **/

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import '@/index.css';

// 连接到 background，用于跟踪侧边栏状态
const connectToBackground = async () => {
  try {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      // 建立连接并发送 tabId
      const port = chrome.runtime.connect({ name: 'sidepanel' });
      port.postMessage({ type: 'SIDEPANEL_OPEN', tabId: tab.id });
    }
  } catch (error) {
    console.error('连接 background 失败:', error);
  }
};

// 建立连接
connectToBackground();

// 渲染应用
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
