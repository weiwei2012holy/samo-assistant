/**
 * @Author wei
 * @Date 2026-02-24
 * @Description Content Script 独立构建配置
 *
 * Chrome content script 不支持 ES module import 语法，因此需要使用 IIFE 格式打包，
 * 将所有依赖（如 providers.ts）内联到单个文件中，输出为自执行函数。
 *
 * 独立于主 vite.config.ts 的原因：
 *   主构建使用 ES 模块格式（用于侧边栏 React 应用），
 *   而 content script 需要 IIFE 格式，两者格式不兼容，因此分开配置。
 **/

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    // 与主配置保持一致，使 @/ 路径别名正常工作
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    // 输出到 dist 目录，与主构建共享
    outDir: 'dist',
    // 不清空 dist，避免覆盖主构建的产物（侧边栏 HTML/JS/CSS）
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/content/content.ts'),
      output: {
        // IIFE 格式：生成自执行函数，不含 import/export 语句
        format: 'iife',
        // name 仅在有 export 时用作全局变量名；content script 无 export，此项为形式要求
        name: 'SamoContent',
        // 直接输出到 dist/content.js（manifest.json 引用的路径）
        entryFileNames: 'content.js',
        dir: 'dist',
      },
    },
  },
});
