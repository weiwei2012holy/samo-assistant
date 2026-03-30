/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 侧边栏入口文件
 **/

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import '@/index.css';

// 解析启动参数：窗口模式通过 URL 传入目标 tabId
const search = new URLSearchParams(window.location.search);
const modeParam = search.get('mode');
const tabIdParam = search.get('tabId');

const surfaceMode = modeParam === 'window'
  ? 'window'
  : modeParam === 'overlay'
    ? 'overlay'
    : 'sidepanel';
const parsedTabId = tabIdParam ? Number(tabIdParam) : NaN;
const initialTargetTabId = Number.isInteger(parsedTabId) ? parsedTabId : null;

// 渲染应用
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App
      surfaceMode={surfaceMode}
      initialTargetTabId={initialTargetTabId}
    />
  </React.StrictMode>
);
