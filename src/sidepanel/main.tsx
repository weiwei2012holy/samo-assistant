/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 侧边栏入口文件
 **/

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import '@/index.css';

// 渲染应用
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
