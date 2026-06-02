/**
 * @Author wei
 * @Date 2026-02-24
 * @Description Content Script，用于提取页面内容、显示浮窗按钮和悬停翻译
 *
 * 注意：此文件通过 vite.content.config.ts 以 IIFE 格式打包，
 * 产物为 dist/content.js，由 manifest.json 引用。
 * 运行时不含任何 import/export 语句。
 **/

import type { ProviderConfig } from '@/types';
import { getProviderBaseUrl } from '@/config/providers';
import { readSSEStream } from '@/utils/stream';

// ==================== 类型定义 ====================

/**
 * Chrome storage 中存储的应用设置（局部，仅包含 content script 需要的字段）
 */
interface StorageSettings {
  translateShortcut?: string;
  floatButtonClickAction?: 'open' | 'open_and_summarize';
  currentProvider?: string;
  providerConfigs?: Record<string, ProviderConfig>;
}

/**
 * 翻译目标，描述当前需要翻译的内容及其来源
 */
interface TranslateTarget {
  /** 来源类型：选中文本 | 鼠标悬停的段落 */
  type: 'selection' | 'element';
  /** 待翻译的原始文本 */
  text: string;
  /** 选区范围（仅 type='selection' 时有值） */
  anchor?: Range;
  /** 关联的 DOM 元素，翻译结果将插入其后 */
  element: Element;
}

const OVERLAY_CONTAINER_ID = 'ai-sidebar-overlay-container';
const OVERLAY_IFRAME_ID = 'ai-sidebar-overlay-iframe';
const OVERLAY_CLOSE_ID = 'ai-sidebar-overlay-close';
const OVERLAY_HEADER_ID = 'ai-sidebar-overlay-header';
const OVERLAY_STATE_STORAGE_KEY = 'ai_sidebar_overlay_state';
const OVERLAY_EDGE_GAP = 6;

interface OverlayState {
  left: number;
  top: number;
  width: number;
  height: number;
  /** 保存时距右侧视口边缘的距离，用于跨视口尺寸恢复位置 */
  rightOffset?: number;
  /** 保存时距底部视口边缘的距离，用于跨视口尺寸恢复位置 */
  bottomOffset?: number;
}

function getDefaultOverlayState(): OverlayState {
  const width = Math.min(420, Math.max(320, window.innerWidth - 32));
  const height = Math.min(760, Math.max(420, window.innerHeight - 48));
  return {
    left: Math.max(8, window.innerWidth - width - 24),
    top: 24,
    width,
    height,
  };
}

function loadOverlayState(): Promise<OverlayState> {
  return new Promise((resolve) => {
    chrome.storage.local.get(OVERLAY_STATE_STORAGE_KEY, (result) => {
      const state = result?.[OVERLAY_STATE_STORAGE_KEY] as OverlayState | undefined;
      if (!state) {
        resolve(getDefaultOverlayState());
        return;
      }

      let { left, top, width, height } = state;
      const { rightOffset, bottomOffset } = state;

      // 根据保存时的锚点边（哪侧偏移更小即为锚点侧）重新计算坐标，
      // 使浮窗在不同视口尺寸下仍还原到相对同一侧的位置
      if (rightOffset !== undefined && rightOffset < left) {
        left = Math.max(OVERLAY_EDGE_GAP, window.innerWidth - rightOffset - width);
      }
      if (bottomOffset !== undefined && bottomOffset < top) {
        top = Math.max(OVERLAY_EDGE_GAP, window.innerHeight - bottomOffset - height);
      }

      resolve({ left, top, width, height });
    });
  });
}

function saveOverlayState(state: OverlayState): void {
  // 同时记录右侧和底部偏移，供跨视口尺寸恢复时判断锚点
  const stateToSave: OverlayState = {
    ...state,
    rightOffset: window.innerWidth - state.left - state.width,
    bottomOffset: window.innerHeight - state.top - state.height,
  };
  chrome.storage.local.set({
    [OVERLAY_STATE_STORAGE_KEY]: stateToSave,
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('保存浮窗状态失败:', chrome.runtime.lastError);
    }
  });
}

function clampOverlayState(state: OverlayState): OverlayState {
  const minWidth = 320;
  const minHeight = 420;
  // 多屏切换时浏览器窗口可能比目标屏幕更宽，取两者较小值确保浮窗在物理屏幕可见区域内
  const effectiveW = Math.min(window.innerWidth, window.screen.availWidth);
  const effectiveH = Math.min(window.innerHeight, window.screen.availHeight);
  const maxWidth = Math.max(minWidth, effectiveW - 12);
  const maxHeight = Math.max(minHeight, effectiveH - 12);

  const width = Math.min(Math.max(state.width, minWidth), maxWidth);
  const height = Math.min(Math.max(state.height, minHeight), maxHeight);
  const left = Math.min(
    Math.max(state.left, OVERLAY_EDGE_GAP),
    Math.max(OVERLAY_EDGE_GAP, effectiveW - width - OVERLAY_EDGE_GAP),
  );
  const top = Math.min(
    Math.max(state.top, OVERLAY_EDGE_GAP),
    Math.max(OVERLAY_EDGE_GAP, effectiveH - height - OVERLAY_EDGE_GAP),
  );

  return {
    left,
    top,
    width,
    height,
  };
}

/**
 * 检测页面是否为深色主题
 * 同时考虑系统偏好和页面背景色，解决"网站深色但系统为浅色"的场景
 */
function isPageDarkTheme(): boolean {
  // 优先采用系统媒体查询
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return true;
  }

  // 读取 html/body 的背景色（跳过透明值）
  for (const el of [document.documentElement, document.body]) {
    const bg = window.getComputedStyle(el).backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;

    const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) continue;

    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    // 用感知亮度公式判断，< 0.5 为深色背景
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }

  return false;
}

/**
 * 根据页面主题更新浮窗容器的深色类
 */
function updateOverlayDarkTheme(container: HTMLDivElement): void {
  container.classList.toggle('ai-sidebar-overlay-dark', isPageDarkTheme());
}

function readOverlayStateFromElement(container: HTMLDivElement): OverlayState {
  const rect = container.getBoundingClientRect();
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function applyOverlayState(container: HTMLDivElement, state: OverlayState): void {
  const normalized = clampOverlayState(state);

  container.style.left = `${normalized.left}px`;
  container.style.top = `${normalized.top}px`;
  container.style.width = `${normalized.width}px`;
  container.style.height = `${normalized.height}px`;
  container.style.right = 'auto';
  container.style.bottom = 'auto';
}

function bindOverlayInteractions(container: HTMLDivElement): void {
  if (container.dataset.bound === '1') {
    return;
  }
  container.dataset.bound = '1';

  const header = container.querySelector(`#${OVERLAY_HEADER_ID}`) as HTMLDivElement | null;
  const closeBtn = container.querySelector(`#${OVERLAY_CLOSE_ID}`) as HTMLButtonElement | null;
  const clearBtn = document.getElementById('ai-sidebar-overlay-clear-btn') as HTMLButtonElement | null;
  const settingsBtn = document.getElementById('ai-sidebar-overlay-settings-btn') as HTMLButtonElement | null;
  const switchModeWrapper = container.querySelector('.ai-sidebar-overlay-mode-wrapper') as HTMLDivElement | null;
  const switchModeBtn = switchModeWrapper?.querySelector('button') as HTMLButtonElement | null;
  const switchModeMenu = switchModeWrapper?.querySelector('.ai-sidebar-overlay-mode-menu') as HTMLDivElement | null;
  const iframe = container.querySelector(`#${OVERLAY_IFRAME_ID}`) as HTMLIFrameElement | null;

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'OVERLAY_CLEAR_MESSAGES' }, '*');
      }
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'OVERLAY_OPEN_SETTINGS' }, '*');
      }
    });
  }

  // 关闭按钮：隐藏整个浮窗，并同步重置浮窗 ICON 的旋转状态
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      container.classList.add('ai-sidebar-overlay-hidden');
      document.querySelector<HTMLButtonElement>('.ai-sidebar-float-main')?.classList.remove('active');
    });
  }

  // 切换显示方式按钮
  if (switchModeBtn && switchModeMenu) {
    switchModeBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      const hidden = switchModeMenu.classList.contains('ai-sidebar-overlay-mode-menu-hidden');
      switchModeMenu.classList.toggle('ai-sidebar-overlay-mode-menu-hidden', !hidden);
    });

    // 点击菜单项：发送切换消息给 background，并关闭菜单
    switchModeMenu.addEventListener('click', (e: MouseEvent) => {
      const item = (e.target as HTMLElement).closest<HTMLButtonElement>('.ai-sidebar-overlay-mode-item');
      if (!item) return;
      const mode = item.dataset.mode;
      if (!mode) return;

      switchModeMenu.classList.add('ai-sidebar-overlay-mode-menu-hidden');

      // 直接发消息，不用 tabs.query 异步查 tabId，让 background 从 sender.tab.id 取，
      // 避免异步查询后丢失用户手势上下文（sidePanel.open 和 windows.create 需要用户手势）
      chrome.runtime.sendMessage({ type: 'SWITCH_DISPLAY_MODE', mode });
    });

    // 点击外部区域关闭菜单（在 shadow DOM 外注册，用 capture 确保优先响应）
    document.addEventListener('click', (e: MouseEvent) => {
      if (!switchModeWrapper?.contains(e.target as Node)) {
        switchModeMenu.classList.add('ai-sidebar-overlay-mode-menu-hidden');
      }
    }, true);
  }

  if (header) {
    header.addEventListener('mousedown', (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest('button')) return;

      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const dragStartClientX = event.clientX;
      const dragStartClientY = event.clientY;
      const dragStartLeft = rect.left;
      const dragStartTop = rect.top;
      let pendingLeft = dragStartLeft;
      let pendingTop = dragStartTop;
      let rafId: number | null = null;

      // 清除可能残留的吸附动画类
      container.classList.remove('ai-sidebar-overlay-snapping');
      container.classList.add('ai-sidebar-overlay-dragging');

      // 使用 RAF 节流：直接更新 left/top，避免 transform 的视觉跳变
      const flushDragFrame = (): void => {
        rafId = null;
        container.style.left = `${pendingLeft}px`;
        container.style.top = `${pendingTop}px`;
        container.style.right = 'auto';
        container.style.bottom = 'auto';
      };

      const onMouseMove = (moveEvent: MouseEvent): void => {
        pendingLeft = dragStartLeft + moveEvent.clientX - dragStartClientX;
        pendingTop = dragStartTop + moveEvent.clientY - dragStartClientY;

        if (rafId !== null) {
          return;
        }
        rafId = window.requestAnimationFrame(flushDragFrame);
      };

      const onMouseUp = (): void => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }

        // 在移除 dragging class 前，先将位置落到松手坐标（transition: none 保证无动画）
        container.style.left = `${pendingLeft}px`;
        container.style.top = `${pendingTop}px`;
        container.style.right = 'auto';
        container.style.bottom = 'auto';

        // 移除拖拽状态（此后 box-shadow 立即恢复，不触发过渡动画）
        container.classList.remove('ai-sidebar-overlay-dragging');

        // 读取当前位置，判断是否越出视口
        const currentState = readOverlayStateFromElement(container);
        const clampedState = clampOverlayState(currentState);

        const outOfBounds =
          Math.abs(currentState.left - clampedState.left) > 1 ||
          Math.abs(currentState.top - clampedState.top) > 1;

        if (outOfBounds) {
          // 越出视口：添加吸附动画类，强制提交当前越界位置，再平滑过渡到边界
          container.classList.add('ai-sidebar-overlay-snapping');
          void container.offsetWidth; // 强制 reflow，确保动画从当前越界位置开始
          applyOverlayState(container, clampedState);
          window.setTimeout(() => {
            container.classList.remove('ai-sidebar-overlay-snapping');
          }, 250);
        }
        // 视口内：直接停在松手位置，无任何动画

        saveOverlayState(clampedState);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      const currentState = readOverlayStateFromElement(container);
      saveOverlayState(currentState);
    });
    observer.observe(container);
  }

  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      container.classList.add('ai-sidebar-overlay-hidden');
      document.querySelector<HTMLButtonElement>('.ai-sidebar-float-main')?.classList.remove('active');
    }
  });

  // 自定义 resize 手柄（右下角），与拖拽同样的模式
  const resizeHandle = container.querySelector('.ai-sidebar-overlay-resize-handle') as HTMLDivElement | null;
  if (resizeHandle) {
    resizeHandle.addEventListener('mousedown', (event: MouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = container.offsetWidth;
      const startHeight = container.offsetHeight;
      const minWidth = 300;
      const minHeight = 400;

      // resize 期间禁用 iframe 事件，防止被截断
      container.classList.add('ai-sidebar-overlay-resizing');

      const onMouseMove = (moveEvent: MouseEvent): void => {
        // 拖拽时同样限制不超出物理屏幕（宽度/高度双向约束）
        const effectiveW = Math.min(window.innerWidth, window.screen.availWidth);
        const effectiveH = Math.min(window.innerHeight, window.screen.availHeight);
        const maxWidth = Math.max(minWidth, effectiveW - container.offsetLeft - OVERLAY_EDGE_GAP);
        const maxHeight = Math.max(minHeight, effectiveH - container.offsetTop - OVERLAY_EDGE_GAP);
        const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + moveEvent.clientX - startX));
        const newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + moveEvent.clientY - startY));
        container.style.width = `${newWidth}px`;
        container.style.height = `${newHeight}px`;
        container.style.right = 'auto';
        container.style.bottom = 'auto';
      };

      const onMouseUp = (): void => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        container.classList.remove('ai-sidebar-overlay-resizing');
        saveOverlayState(readOverlayStateFromElement(container));
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  window.addEventListener('resize', () => {
    applyOverlayState(container, readOverlayStateFromElement(container));
  });
}

/**
 * 构建页面内浮窗 iframe URL
 * @param tabId - 目标标签页 ID
 */
function buildOverlayUrl(tabId: number): string {
  const url = new URL(chrome.runtime.getURL('sidepanel.html'));
  url.searchParams.set('mode', 'overlay');
  url.searchParams.set('tabId', String(tabId));
  return url.toString();
}

/**
 * 获取或创建页面内浮窗容器
 */
function getOrCreateOverlayContainer(tabId: number): HTMLDivElement {
  const existing = document.getElementById(OVERLAY_CONTAINER_ID) as HTMLDivElement | null;
  if (existing) {
    return existing;
  }

  const container = document.createElement('div');
  container.id = OVERLAY_CONTAINER_ID;
  container.className = 'ai-sidebar-overlay-container ai-sidebar-overlay-hidden';

  const header = document.createElement('div');
  header.id = OVERLAY_HEADER_ID;
  header.className = 'ai-sidebar-overlay-header';

  // 左侧：图标 + 标题
  const titleGroup = document.createElement('div');
  titleGroup.className = 'ai-sidebar-overlay-title-group';

  const titleIcon = document.createElement('img');
  titleIcon.className = 'ai-sidebar-overlay-title-icon';
  titleIcon.src = chrome.runtime.getURL('icons/icon48.png');
  titleIcon.alt = '';
  titleIcon.draggable = false;

  const title = document.createElement('span');
  title.className = 'ai-sidebar-overlay-title';
  title.textContent = 'Samo 助手';

  titleGroup.appendChild(titleIcon);
  titleGroup.appendChild(title);

  // 右侧操作区
  const actions = document.createElement('div');
  actions.className = 'ai-sidebar-overlay-actions';

  // 清空按钮（循环箭头图标）
  const clearBtn = document.createElement('button');
  clearBtn.id = 'ai-sidebar-overlay-clear-btn';
  clearBtn.className = 'ai-sidebar-overlay-action-btn';
  clearBtn.setAttribute('aria-label', '清空对话');
  clearBtn.title = '清空对话';
  clearBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;

  // 设置按钮（齿轮图标）
  const settingsBtn = document.createElement('button');
  settingsBtn.id = 'ai-sidebar-overlay-settings-btn';
  settingsBtn.className = 'ai-sidebar-overlay-action-btn';
  settingsBtn.setAttribute('aria-label', '设置');
  settingsBtn.title = '设置';
  settingsBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;

  // 切换显示方式按钮 + 下拉菜单
  const switchModeWrapper = document.createElement('div');
  switchModeWrapper.className = 'ai-sidebar-overlay-mode-wrapper';

  const switchModeBtn = document.createElement('button');
  switchModeBtn.className = 'ai-sidebar-overlay-action-btn';
  switchModeBtn.setAttribute('aria-label', '切换显示方式');
  switchModeBtn.title = '切换显示方式';
  // LayoutPanelRight 图标
  switchModeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="M3 9h12"/></svg>`;

  const switchModeMenu = document.createElement('div');
  switchModeMenu.className = 'ai-sidebar-overlay-mode-menu ai-sidebar-overlay-mode-menu-hidden';
  switchModeMenu.innerHTML = `
    <button class="ai-sidebar-overlay-mode-item" data-mode="overlay">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M12 4v16"/><path d="M2 10h10"/></svg>
      <span>页面内浮窗</span>
      <span class="ai-sidebar-overlay-mode-current" data-for="overlay">当前</span>
    </button>
    <button class="ai-sidebar-overlay-mode-item" data-mode="window">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
      <span>独立窗口</span>
      <span class="ai-sidebar-overlay-mode-current" data-for="window" style="display:none">当前</span>
    </button>
    <button class="ai-sidebar-overlay-mode-item" data-mode="sidepanel">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/></svg>
      <span>浏览器侧边栏</span>
      <span class="ai-sidebar-overlay-mode-current" data-for="sidepanel" style="display:none">当前</span>
    </button>
  `;

  switchModeWrapper.appendChild(switchModeBtn);
  switchModeWrapper.appendChild(switchModeMenu);

  // 关闭按钮（X 图标）
  const closeBtn = document.createElement('button');
  closeBtn.id = OVERLAY_CLOSE_ID;
  closeBtn.className = 'ai-sidebar-overlay-action-btn close-btn';
  closeBtn.setAttribute('aria-label', '关闭助手');
  closeBtn.title = '关闭助手';
  closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

  actions.appendChild(clearBtn);
  actions.appendChild(settingsBtn);
  actions.appendChild(switchModeWrapper);
  actions.appendChild(closeBtn);
  header.appendChild(titleGroup);
  header.appendChild(actions);

  const iframe = document.createElement('iframe');
  iframe.id = OVERLAY_IFRAME_ID;
  iframe.className = 'ai-sidebar-overlay-iframe';
  iframe.src = buildOverlayUrl(tabId);
  iframe.setAttribute('title', 'Samo 助手');
  iframe.setAttribute('loading', 'eager');

  // 自定义 resize 手柄，悬浮在 iframe 上方，避免被 iframe 事件截断
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'ai-sidebar-overlay-resize-handle';

  container.appendChild(header);
  container.appendChild(iframe);
  container.appendChild(resizeHandle);
  document.body.appendChild(container);

  // 检测页面主题并设置深色类
  updateOverlayDarkTheme(container);

  // 监听 html/body 的 class/style/data-theme 变化，响应网站动态切换主题
  const themeObserver = new MutationObserver(() => {
    updateOverlayDarkTheme(container);
  });
  const observeOpts: MutationObserverInit = {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme'],
  };
  themeObserver.observe(document.documentElement, observeOpts);
  themeObserver.observe(document.body, observeOpts);

  bindOverlayInteractions(container);
  loadOverlayState().then((state) => {
    applyOverlayState(container, state);
  });

  return container;
}

/**
 * 打开页面内浮窗，并确保 iframe 指向当前 tabId
 */
function openAssistantOverlay(tabId: number): void {
  const container = getOrCreateOverlayContainer(tabId);
  const iframe = container.querySelector(`#${OVERLAY_IFRAME_ID}`) as HTMLIFrameElement | null;

  if (iframe) {
    const targetUrl = buildOverlayUrl(tabId);
    if (iframe.src !== targetUrl) {
      iframe.src = targetUrl;
    }
  }

  container.classList.remove('ai-sidebar-overlay-hidden');
  // 每次打开前重新 clamp，防止从宽屏移到窄屏后尺寸/位置超出可见区域
  applyOverlayState(container, readOverlayStateFromElement(container));
  saveOverlayState(readOverlayStateFromElement(container));
}

// ==================== 浮窗按钮功能 ====================

/** 创建可拖拽的浮窗按钮 */
function createFloatButton(): void {
  // 检查是否已存在，避免重复创建
  if (document.getElementById('ai-sidebar-float-btn')) {
    return;
  }

  // 创建浮窗容器
  const floatContainer = document.createElement('div');
  floatContainer.id = 'ai-sidebar-float-btn';
  floatContainer.className = 'ai-sidebar-float-container';

  // 主按钮 - 卡通萨摩耶 SVG（两状态：睡觉 / 清醒）
  const mainBtn = document.createElement('button');
  mainBtn.className = 'ai-sidebar-float-main';
  mainBtn.draggable = false;
  mainBtn.innerHTML = `
<svg class="ai-sidebar-samoyed" width="46" height="46" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" overflow="visible">
  <!-- ===== 睡觉状态（默认显示） ===== -->
  <g class="ai-sidebar-samoyed-sleep">
    <!-- 耳朵（溢出顶部，画在脸下面） -->
    <ellipse cx="10" cy="6"  rx="9" ry="12" fill="#dde4ff" stroke="#b8c4ee" stroke-width="1" transform="rotate(-20,10,6)"/>
    <ellipse cx="38" cy="6"  rx="9" ry="12" fill="#dde4ff" stroke="#b8c4ee" stroke-width="1" transform="rotate(20,38,6)"/>
    <ellipse cx="10" cy="7"  rx="4.5" ry="7" fill="#ffc8d4" transform="rotate(-20,10,7)"/>
    <ellipse cx="38" cy="7"  rx="4.5" ry="7" fill="#ffc8d4" transform="rotate(20,38,7)"/>
    <!-- 脸：填满 viewBox，无外框 -->
    <circle cx="24" cy="24" r="23" fill="#f5f7ff"/>
    <!-- 闭眼 -->
    <path d="M9 23 Q16 29 23 23"  stroke="#5a6a9a" stroke-width="2.8" stroke-linecap="round" fill="none"/>
    <path d="M25 23 Q32 29 39 23" stroke="#5a6a9a" stroke-width="2.8" stroke-linecap="round" fill="none"/>
    <!-- 鼻子 -->
    <ellipse cx="24" cy="31" rx="6" ry="4" fill="#8090c0"/>
    <ellipse cx="22" cy="30" rx="2" ry="1.3" fill="#a0b0d8" opacity="0.6"/>
    <!-- 嘴 -->
    <path d="M14 37 Q24 44 34 37" stroke="#8090c0" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    <!-- 腮红 -->
    <ellipse cx="8"  cy="35" rx="6.5" ry="4.5" fill="#ffb3c6" opacity="0.5"/>
    <ellipse cx="40" cy="35" rx="6.5" ry="4.5" fill="#ffb3c6" opacity="0.5"/>
    <!-- Zzz -->
    <text class="ai-sidebar-zzz-1" x="38" y="20" font-size="7"  font-weight="bold" fill="#8090c0" font-family="sans-serif">z</text>
    <text class="ai-sidebar-zzz-2" x="42" y="12" font-size="9"  font-weight="bold" fill="#8090c0" font-family="sans-serif">z</text>
    <text class="ai-sidebar-zzz-3" x="46" y="2"  font-size="11" font-weight="bold" fill="#8090c0" font-family="sans-serif">Z</text>
  </g>

  <!-- ===== 清醒状态（激活时显示） ===== -->
  <g class="ai-sidebar-samoyed-awake">
    <!-- 呼吸圈：贴着脸圆，激活时显示 -->
    <circle class="ai-sidebar-breathe-ring" cx="24" cy="24" r="24"/>
    <!-- 耳朵 -->
    <ellipse class="ai-sidebar-ear-l" cx="10" cy="6"  rx="9" ry="12" fill="#ffeedd" stroke="#e8c8a0" stroke-width="1" transform="rotate(-20,10,6)"/>
    <ellipse class="ai-sidebar-ear-r" cx="38" cy="6"  rx="9" ry="12" fill="#ffeedd" stroke="#e8c8a0" stroke-width="1" transform="rotate(20,38,6)"/>
    <ellipse cx="10" cy="7"  rx="4.5" ry="7" fill="#ffc8d4" transform="rotate(-20,10,7)"/>
    <ellipse cx="38" cy="7"  rx="4.5" ry="7" fill="#ffc8d4" transform="rotate(20,38,7)"/>
    <!-- 脸 -->
    <circle cx="24" cy="24" r="23" fill="#fffaf5"/>
    <!-- 眼睛左 -->
    <g class="ai-sidebar-eye-l">
      <circle cx="15" cy="24" r="6.5" fill="white"/>
      <circle cx="15" cy="24" r="4"   fill="#1a2a4a"/>
      <circle cx="17" cy="22" r="1.5" fill="white"/>
    </g>
    <!-- 眼睛右 -->
    <g class="ai-sidebar-eye-r">
      <circle cx="33" cy="24" r="6.5" fill="white"/>
      <circle cx="33" cy="24" r="4"   fill="#1a2a4a"/>
      <circle cx="35" cy="22" r="1.5" fill="white"/>
    </g>
    <!-- 鼻子 -->
    <ellipse cx="24" cy="32" rx="6" ry="4" fill="#6a5040"/>
    <ellipse cx="22" cy="31" rx="2" ry="1.3" fill="#8a7060" opacity="0.6"/>
    <!-- 嘴 -->
    <path d="M14 37 Q24 42 34 37" stroke="#6a5040" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    <!-- 舌头 -->
    <g class="ai-sidebar-tongue">
      <ellipse cx="24" cy="45"   rx="5" ry="5.5" fill="#ff6080"/>
      <ellipse cx="24" cy="46.5" rx="5" ry="3.5" fill="#ff6080"/>
      <line x1="24" y1="40" x2="24" y2="50" stroke="#d04060" stroke-width="1.8"/>
    </g>
    <!-- 腮红 -->
    <ellipse cx="8"  cy="35" rx="6.5" ry="4.5" fill="#ffb3c6" opacity="0.6"/>
    <ellipse cx="40" cy="35" rx="6.5" ry="4.5" fill="#ffb3c6" opacity="0.6"/>
  </g>
</svg>`;
  mainBtn.title = 'Samo 助手';
  mainBtn.setAttribute('aria-label', 'Samo 助手');

  floatContainer.appendChild(mainBtn);

  // 阻止浏览器原生拖拽（尤其是按钮中的 img）抢占拖动事件
  const preventNativeDrag = (e: DragEvent): void => {
    e.preventDefault();
  };
  mainBtn.addEventListener('dragstart', preventNativeDrag);
  floatContainer.addEventListener('dragstart', preventNativeDrag);

  document.body.appendChild(floatContainer);

  // ---- 拖拽功能 ----
  let isDragging = false;
  // 鼠标按下时记录的初始坐标及浮窗位置
  let startX = 0, startY = 0, startLeft = 0, startBottom = 0;

  mainBtn.addEventListener('mousedown', (e: MouseEvent) => {
    // 只响应左键
    if (e.button !== 0) return;

    // 阻止默认行为，避免出现图片原生拖拽或页面文字选中
    e.preventDefault();

    isDragging = false;
    startX = e.clientX;
    startY = e.clientY;

    const rect = floatContainer.getBoundingClientRect();
    startLeft = rect.left;
    startBottom = window.innerHeight - rect.bottom;

    const onMouseMove = (ev: MouseEvent) => {
      const deltaX = ev.clientX - startX;
      const deltaY = ev.clientY - startY;

      // 移动超过 5px 才认为是拖拽，避免误触
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        isDragging = true;

        let newLeft = startLeft + deltaX;
        let newBottom = startBottom - deltaY;

        // 边界限制，防止拖出视口
        const maxLeft = window.innerWidth - floatContainer.offsetWidth - 10;
        const maxBottom = window.innerHeight - floatContainer.offsetHeight - 10;

        newLeft = Math.max(10, Math.min(newLeft, maxLeft));
        newBottom = Math.max(10, Math.min(newBottom, maxBottom));

        floatContainer.style.left = `${newLeft}px`;
        floatContainer.style.right = 'auto';
        floatContainer.style.bottom = `${newBottom}px`;
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // 拖拽结束后，延迟重置标志，阻止 click 事件触发动作
      if (isDragging) {
        setTimeout(() => {
          isDragging = false;
        }, 0);
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // 点击主按钮智能切换：首次打开时展示并执行动作，再次点击时切换显隐
  mainBtn.addEventListener('click', (e) => {
    if (isDragging) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }

    e.stopPropagation();

    // 触发按压弹跳动画（先移除再重新添加，确保快速连点时也能重启动画）
    mainBtn.classList.remove('pressing');
    void mainBtn.offsetWidth; // 强制 reflow，使动画重置
    mainBtn.classList.add('pressing');
    mainBtn.addEventListener('animationend', () => {
      mainBtn.classList.remove('pressing');
    }, { once: true });

    // 检查 overlay 当前可见状态
    const overlayContainer = document.getElementById(OVERLAY_CONTAINER_ID) as HTMLDivElement | null;
    const isOverlayOpen = overlayContainer && !overlayContainer.classList.contains('ai-sidebar-overlay-hidden');

    if (isOverlayOpen) {
      // 已打开：隐藏 overlay，按钮恢复无光晕状态
      overlayContainer!.classList.add('ai-sidebar-overlay-hidden');
      mainBtn.classList.remove('active');
    } else if (overlayContainer) {
      // 容器已存在但当前隐藏：重新 clamp 后恢复显示，防止多屏切换后超出可见区域
      overlayContainer.classList.remove('ai-sidebar-overlay-hidden');
      applyOverlayState(overlayContainer, readOverlayStateFromElement(overlayContainer));
      mainBtn.classList.add('active');
      saveOverlayState(readOverlayStateFromElement(overlayContainer));
    } else {
      // 容器不存在：首次打开，向后台脚本发送消息并按配置执行动作
      mainBtn.classList.add('active');
      const action = floatButtonClickAction === 'open_and_summarize' ? 'summarize' : 'open_sidebar';
      chrome.runtime.sendMessage({ type: 'FLOAT_ACTION', action });
    }
  });
}

/** 初始化浮窗按钮（仅在主页面，不在 iframe 中） */
function initFloatButton(): void {
  const isInIframe = window !== window.top;
  if (isInIframe) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createFloatButton);
  } else {
    createFloatButton();
  }
}

// ==================== 页面内容提取功能 ====================

/** 提取结果结构，与 src/types/index.ts 中的 PageContent 保持一致 */
interface PageContentResult {
  title: string;
  url: string;
  description: string | null;
  content: string;
  timestamp: number;
}

// 监听来自 background / sidepanel 的内容提取请求
chrome.runtime.onMessage.addListener(
  (
    message: { type: string; tabId?: number },
    _sender,
    sendResponse: (response: PageContentResult | { success: boolean }) => void,
  ) => {
    if (message.type === 'OPEN_ASSISTANT_OVERLAY') {
      const targetTabId = Number.isInteger(message.tabId) ? (message.tabId as number) : null;
      if (targetTabId !== null) {
        openAssistantOverlay(targetTabId);
      }
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'CLOSE_ASSISTANT_OVERLAY') {
      const container = document.getElementById(OVERLAY_CONTAINER_ID) as HTMLDivElement | null;
      if (container) {
        container.classList.add('ai-sidebar-overlay-hidden');
      }
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'EXTRACT_CONTENT') {
      const content = extractPageContent();
      sendResponse(content);
      return true;
    }

    return false;
  }
);

/**
 * 提取页面的主要文本内容
 * 优先级：article > main > body（排除导航、页脚等非内容区域）
 */
function extractPageContent(): PageContentResult {
  const title = document.title || '';
  const url = window.location.href;

  let content = '';

  const article = document.querySelector('article');
  if (article) {
    content = cleanText((article as HTMLElement).innerText);
  } else {
    const main = document.querySelector('main');
    if (main) {
      content = cleanText((main as HTMLElement).innerText);
    } else {
      content = extractBodyContent();
    }
  }

  const metaDescription = document.querySelector('meta[name="description"]');
  const description = metaDescription ? metaDescription.getAttribute('content') : null;

  return {
    title,
    url,
    description,
    content: content.slice(0, 50000), // 限制内容长度，避免超出 API 上下文
    timestamp: Date.now(),
  };
}

/**
 * 清理文本，合并多余空白和换行
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

/**
 * 从 body 克隆中提取主体文本，移除脚本、导航、广告等非内容元素
 */
function extractBodyContent(): string {
  // 克隆 body 以避免修改原始 DOM
  const bodyClone = document.body.cloneNode(true) as HTMLElement;

  const selectorsToRemove = [
    'script', 'style', 'nav', 'footer', 'header',
    'aside', 'iframe', 'noscript', 'svg', 'form',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    '.nav', '.navbar', '.footer', '.header', '.sidebar',
    '.advertisement', '.ad', '.ads', '.social-share',
    '#ai-sidebar-float-btn', // 移除浮窗按钮本身
    '#ai-sidebar-overlay-container', // 移除页面内助手浮窗
  ];

  selectorsToRemove.forEach(selector => {
    try {
      bodyClone.querySelectorAll(selector).forEach(el => el.remove());
    } catch {
      // 忽略不合法的选择器
    }
  });

  return cleanText(bodyClone.innerText);
}

// ==================== 悬停翻译功能 ====================

/** 翻译模式是否已激活 */
let translateModeActive = false;
/** 当前鼠标悬停的 DOM 元素 */
let currentHoverElement: Element | null = null;
/** 当前正在翻译的元素（防止重复触发同一元素） */
let translatingElement: Element | null = null;
/** 翻译触发快捷键，默认为 Control */
let translateShortcut = 'Control';
/** 浮窗主按钮点击行为，默认仅打开 */
let floatButtonClickAction: 'open' | 'open_and_summarize' = 'open';
/** 当前供应商的 API 配置 */
let providerConfig: ProviderConfig | null = null;
/** 配置是否已从 storage 加载完毕 */
let configLoaded = false;
/** 翻译结果缓存，避免对相同文本重复请求 */
const translatedTexts = new Map<string, string>();

/**
 * 从 chrome.storage.sync 加载翻译所需配置（异步）
 */
function loadTranslateConfig(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.get('ai_sidebar_settings', (result) => {
      const settings: StorageSettings = result['ai_sidebar_settings'] || {};
      translateShortcut = settings.translateShortcut || 'Control';
      floatButtonClickAction = settings.floatButtonClickAction || 'open';

      const currentProvider = settings.currentProvider || 'openai';
      providerConfig = settings.providerConfigs?.[currentProvider] ?? null;
      configLoaded = true;

      console.log('翻译配置已加载:', { translateShortcut, provider: currentProvider });
      resolve();
    });
  });
}

// 监听存储变化，实时更新配置（用户在设置面板保存后立即生效）
chrome.storage.onChanged.addListener((changes) => {
  if (changes['ai_sidebar_settings']) {
    loadTranslateConfig();
  }
});

/**
 * 获取当前的翻译目标
 * 优先级：选中文本 > 鼠标悬停的段落
 */
function getTranslateTarget(): TranslateTarget | null {
  // 优先：选中文本
  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 0) {
    const text = selection.toString().trim();
    try {
      const range = selection.getRangeAt(0);
      const element = range.commonAncestorContainer.parentElement;
      if (!element) return null;

      // 防套娃：如果选中内容本身在翻译结果内，不再翻译
      if (isInsideTranslation(element)) {
        return null;
      }

      return { type: 'selection', text, anchor: range.cloneRange(), element };
    } catch {
      // 忽略获取 range 的错误（如跨 iframe 选择）
    }
  }

  // 其次：鼠标悬停的段落
  if (!currentHoverElement) return null;

  const bestParagraph = findBestParagraph(currentHoverElement);
  if (bestParagraph) {
    const text = (bestParagraph as HTMLElement).innerText?.trim();
    if (text && text.length > 0 && text.length < 5000) {
      return { type: 'element', text, element: bestParagraph };
    }
  }

  return null;
}

/**
 * 查找最合适的段落容器
 * 策略：
 * 1. 块级语义元素（P/H1-H6/LI 等）直接返回
 * 2. 内联元素（SPAN/A 等）：若自身文本 ≥ 10 字符，说明被当作段落使用（如 <span data-as="p">），直接返回；
 *    否则向上查找块级父元素
 * 3. 容器元素（DIV 等）根据文本长度和子元素结构判断
 *
 * @param startElement - 起始元素（通常为鼠标悬停的元素）
 * @returns 最合适的段落元素，未找到时返回 null
 */
function findBestParagraph(startElement: Element): Element | null {
  // 防套娃：起始元素在翻译结果内时直接返回
  if (isInsideTranslation(startElement)) {
    return null;
  }

  // 明确的块级段落元素（优先级最高）
  const blockParagraphs = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'LI', 'BLOCKQUOTE', 'ARTICLE', 'SECTION'];
  // 可能的段落容器（需要进一步判断文本长度和子元素结构）
  const containerElements = ['DIV', 'TD', 'TH', 'DD', 'FIGCAPTION'];
  // 内联元素（文本较短时需向上查找块级容器）
  const inlineElements = ['SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'CODE',
    'MARK', 'SMALL', 'SUB', 'SUP', 'LABEL'];

  let el: Element | null = startElement;

  while (el && el !== document.body) {
    // 跳过翻译结果容器
    if (el.classList?.contains('ai-sidebar-translation')) {
      return null;
    }

    const tagName = el.tagName;
    const text = (el as HTMLElement).innerText?.trim() || '';

    // 明确的块级段落元素，直接返回
    if (blockParagraphs.includes(tagName)) {
      return el;
    }

    // 内联元素：有实质文本（≥ 10 字符）时视为"伪段落"直接返回，
    // 避免爬到整个页面容器；文本过短才向上查找
    if (inlineElements.includes(tagName)) {
      if (text.length >= 10 && text.length < 5000) {
        return el;
      }
      el = el.parentElement;
      continue;
    }

    // 容器元素（如 DIV），判断是否适合作为翻译段落
    if (containerElements.includes(tagName)) {
      if (text.length > 0 && text.length < 5000) {
        // 短文本（< 500 字符）认为是一行或一段，直接返回
        if (text.length < 500) {
          return el;
        }
        // 较长文本：若没有多个块级子元素（即是"叶子"段落），也可以返回
        if (!hasSignificantBlockChildren(el)) {
          return el;
        }
        // 有多个块级子元素，说明这是大容器，继续向上查找
      }
    }

    el = el.parentElement;
  }

  return null;
}

/**
 * 检查元素是否在翻译结果容器内部（防止对翻译结果再次翻译）
 */
function isInsideTranslation(element: Element): boolean {
  let el: Element | null = element;
  while (el && el !== document.body) {
    if (el.classList?.contains('ai-sidebar-translation')) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * 检查元素是否有多个显著的块级子元素（用于判断是否为大容器）
 * 超过 1 个块级直接子元素时认为是容器，而非段落
 */
function hasSignificantBlockChildren(element: Element): boolean {
  const blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'UL', 'OL', 'LI', 'BLOCKQUOTE', 'ARTICLE', 'SECTION',
    'TABLE', 'FORM', 'HEADER', 'FOOTER', 'NAV', 'ASIDE'];

  let blockCount = 0;
  for (const child of element.children) {
    if (blockTags.includes(child.tagName)) {
      blockCount++;
      if (blockCount > 1) return true;
    }
  }
  return false;
}

/**
 * 调用翻译 API（流式），逐字输出翻译结果
 *
 * @param text - 待翻译的文本
 * @param onChunk - 每收到一段输出时的回调（参数为截至当前的完整已翻译内容）
 * @returns 完整翻译文本
 */
async function translateWithStream(
  text: string,
  onChunk: (content: string) => void
): Promise<string> {
  if (!providerConfig?.apiKey) {
    throw new Error('未配置 API 密钥');
  }

  // 优先使用用户自定义的 baseUrl，其次从统一配置中获取默认值
  const baseUrl = providerConfig.baseUrl
    || getProviderBaseUrl(providerConfig.provider)
    || 'https://api.openai.com/v1';

  const model = providerConfig.model || 'gpt-4o-mini';
  const isOpenRouter = baseUrl.includes('openrouter.ai');

  // 构建请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${providerConfig.apiKey}`,
  };

  // OpenRouter 需要额外的来源标识头
  if (isOpenRouter) {
    headers['HTTP-Referer'] = chrome.runtime.getURL('/');
    headers['X-Title'] = 'Samo Assistant';
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: '你是一个翻译助手。将用户输入翻译成中文，如果已是中文则翻译成英文。只返回翻译结果，不要添加任何解释或前缀。',
        },
        { role: 'user', content: text },
      ],
      stream: true,
    }),
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errorBody = await response.text();
      const errorJson = JSON.parse(errorBody);
      errorDetail = errorJson.error?.message || errorJson.message || errorBody;
    } catch {
      errorDetail = response.statusText;
    }
    throw new Error(`模型: ${model}\n状态: ${response.status}\n错误: ${errorDetail}`);
  }

  let fullContent = '';

  await readSSEStream(response.body!, (parsed) => {
    const content = (parsed as { choices?: Array<{ delta?: { content?: string } }> })
      .choices?.[0]?.delta?.content || '';
    if (content) {
      fullContent += content;
      onChunk(fullContent); // 回调传递累积内容，UI 实时更新
    }
  });

  return fullContent;
}

/**
 * 在目标元素下方插入翻译结果容器
 *
 * @param target - 翻译目标（element 已由 findBestParagraph 确定为最合适的段落元素）
 * @param isLoading - 是否显示加载中状态
 * @returns 翻译结果容器元素
 */
function showTranslation(target: TranslateTarget, isLoading = false): HTMLElement {
  const sourceEl = target.element;

  // 确定插入基准点：
  // - 若 sourceEl 是内联元素（span/strong 等）且直接父元素是块级段落（p/h1-h6/li），
  //   则插入到段落之后，避免翻译框出现在段落中间
  // - 其他情况（包括 <span data-as="p"> 这类伪段落）直接插在 sourceEl 之后
  const blockParagraphTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'];
  const inlineTags = ['SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'CODE',
    'MARK', 'SMALL', 'SUB', 'SUP', 'LABEL'];

  let insertTarget: Element = sourceEl;
  if (inlineTags.includes(sourceEl.tagName)) {
    const parent = sourceEl.parentElement;
    if (parent && blockParagraphTags.includes(parent.tagName)) {
      // 真正嵌套在段落内的内联元素（如 <p>...<strong>xxx</strong>...</p>），上移到段落级
      insertTarget = parent;
    }
    // 其他情况（如 <span data-as="p"> 直接是 div 的子项）维持 sourceEl 不变
  }

  // 判断插入后是否会成为横向 flex 容器的直接子项（如响应式两列布局）
  const insertionParent = insertTarget.parentElement;
  const insertionParentStyle = insertionParent ? window.getComputedStyle(insertionParent) : null;
  const parentIsHorizontalFlex =
    insertionParentStyle?.display === 'flex' && insertionParentStyle?.flexDirection !== 'column';

  if (parentIsHorizontalFlex) {
    // 横向 flex 子项：清理内部末尾的旧翻译，插入到其内部末尾
    const lastChild = insertTarget.lastElementChild;
    if (lastChild?.classList?.contains('ai-sidebar-translation')) {
      lastChild.remove();
    }
  } else {
    // 普通情况：清理紧随其后的旧翻译，插入到其后方
    const nextSibling = insertTarget.nextElementSibling;
    if (nextSibling?.classList?.contains('ai-sidebar-translation')) {
      nextSibling.remove();
    }
  }

  const container = document.createElement('div');
  container.className = 'ai-sidebar-translation';
  if (isLoading) {
    container.classList.add('ai-sidebar-translation-loading');
  }

  container.innerHTML = `
    <button class="ai-sidebar-translation-close" title="关闭">×</button>
    <div class="ai-sidebar-translation-content">${isLoading ? '翻译中...' : ''}</div>
  `;

  if (parentIsHorizontalFlex) {
    insertTarget.insertAdjacentElement('beforeend', container);
  } else {
    insertTarget.insertAdjacentElement('afterend', container);
  }

  // 关闭按钮：点击移除翻译结果
  const closeBtn = container.querySelector('.ai-sidebar-translation-close');
  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    container.remove();
  });

  return container;
}

/**
 * 更新翻译容器中的文本内容，并清除加载状态样式
 */
function updateTranslationContent(container: HTMLElement, content: string): void {
  const contentEl = container.querySelector('.ai-sidebar-translation-content');
  if (contentEl) {
    // 去除首尾空白/换行，避免模型返回的前导换行在 pre-wrap 下渲染为空行
    contentEl.textContent = content.trim();
  }
  container.classList.remove('ai-sidebar-translation-loading');
}

/**
 * 检查当前翻译目标并发起翻译请求
 * 包含缓存检查、重复翻译防护、流式输出
 */
async function checkAndTranslate(): Promise<void> {
  if (!translateModeActive) return;

  // 确保配置已加载（首次加载时可能还未完成）
  if (!configLoaded) {
    await loadTranslateConfig();
  }

  const target = getTranslateTarget();
  if (!target) return;

  // 防止重复翻译同一元素
  if (translatingElement === target.element) return;

  // 命中缓存，直接显示
  if (translatedTexts.has(target.text)) {
    const cached = translatedTexts.get(target.text)!;
    const container = showTranslation(target);
    updateTranslationContent(container, cached);
    return;
  }

  // 目标元素下方已有翻译结果，不重复触发
  const existingTranslation = target.element?.nextElementSibling;
  if (existingTranslation?.classList?.contains('ai-sidebar-translation')) {
    return;
  }

  translatingElement = target.element;

  try {
    const container = showTranslation(target, true);

    const translation = await translateWithStream(target.text, (content) => {
      updateTranslationContent(container, content);
    });

    // 写入缓存
    translatedTexts.set(target.text, translation);
  } catch (error) {
    console.error('翻译失败:', error);
    // 在已显示的翻译容器中展示错误信息
    const existingContainer = target.element?.nextElementSibling;
    if (existingContainer?.classList?.contains('ai-sidebar-translation')) {
      updateTranslationContent(
        existingContainer as HTMLElement,
        `翻译失败: ${(error as Error).message}`
      );
    }
  } finally {
    translatingElement = null;
  }
}

/**
 * 判断事件是否为"仅按下了配置的快捷键"（单个修饰键，无其他键同时按下）
 * 用于与 Ctrl+A、Ctrl+C 等组合键区分
 */
function isOnlyShortcutKey(e: KeyboardEvent): boolean {
  // 统计当前按下的修饰键数量
  const modifierCount = (e.ctrlKey ? 1 : 0) + (e.altKey ? 1 : 0)
    + (e.shiftKey ? 1 : 0) + (e.metaKey ? 1 : 0);

  // 必须只有一个修饰键，且该键本身就是修饰键（e.key 为修饰键名称）
  const isModifierKey = ['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(e.key);

  if (modifierCount !== 1 || !isModifierKey) {
    return false;
  }

  // 检查是否是用户配置的快捷键
  switch (translateShortcut) {
    case 'Control': return e.ctrlKey;
    case 'Alt':     return e.altKey;
    case 'Shift':   return e.shiftKey;
    case 'Meta':    return e.metaKey;
    default:        return e.ctrlKey;
  }
}

// 快捷键延迟触发（防止与 Ctrl+A/C/V 等组合键冲突）
let shortcutPressTimer: ReturnType<typeof setTimeout> | null = null;
/** 按住快捷键超过此时间（ms）才激活翻译模式 */
const SHORTCUT_DELAY = 150;

/** 激活翻译模式 */
function activateTranslateMode(): void {
  if (translateModeActive) return;
  translateModeActive = true;
  document.body.classList.add('ai-sidebar-translate-mode');
  console.log('翻译模式已激活');

  ensureCurrentElement();

  // 如果还没有获取到鼠标位置下的元素，等待第一次鼠标移动后自动翻译
  if (!currentHoverElement) {
    const onFirstInteraction = (ev: PointerEvent) => {
      if (!translateModeActive) {
        document.removeEventListener('pointermove', onFirstInteraction, true);
        return;
      }
      updateMousePosition(ev);
      if (currentHoverElement) {
        checkAndTranslate();
        document.removeEventListener('pointermove', onFirstInteraction, true);
      }
    };
    document.addEventListener('pointermove', onFirstInteraction, { capture: true, passive: true });
    console.log('等待鼠标移动以确定翻译目标...');
  } else {
    checkAndTranslate();
  }
}

/** 关闭翻译模式 */
function deactivateTranslateMode(): void {
  // 取消尚未触发的延迟定时器
  if (shortcutPressTimer) {
    clearTimeout(shortcutPressTimer);
    shortcutPressTimer = null;
  }

  if (translateModeActive) {
    translateModeActive = false;
    document.body.classList.remove('ai-sidebar-translate-mode');
    console.log('翻译模式已关闭');
  }
}

// ---- 快捷键监听（捕获阶段，优先于页面自身的事件处理） ----

document.addEventListener('keydown', (e) => {
  if (!isOnlyShortcutKey(e)) {
    // 按下组合键（如 Ctrl+A），取消正在等待的翻译激活
    if (shortcutPressTimer) {
      clearTimeout(shortcutPressTimer);
      shortcutPressTimer = null;
      console.log('检测到组合键，取消翻译触发');
    }
    return;
  }

  // 已处于翻译模式或已有等待定时器，跳过
  if (translateModeActive || shortcutPressTimer) return;

  // 延迟激活，避免与其他快捷键冲突
  shortcutPressTimer = setTimeout(() => {
    shortcutPressTimer = null;
    activateTranslateMode();
  }, SHORTCUT_DELAY);

  console.log(`快捷键按下，${SHORTCUT_DELAY}ms 后激活翻译模式...`);
}, true);

document.addEventListener('keyup', (e) => {
  const wasShortcutKey = (
    (translateShortcut === 'Control' && e.key === 'Control') ||
    (translateShortcut === 'Alt'     && e.key === 'Alt') ||
    (translateShortcut === 'Shift'   && e.key === 'Shift') ||
    (translateShortcut === 'Meta'    && (e.key === 'Meta' || e.key === 'OS'))
  );

  if (wasShortcutKey) {
    deactivateTranslateMode();
  }
}, true);

// ---- 鼠标位置追踪 ----

let lastMouseX: number | null = null;
let lastMouseY: number | null = null;
let hasMousePosition = false;

/** 更新鼠标位置和当前悬停元素 */
function updateMousePosition(e: PointerEvent | MouseEvent): void {
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  hasMousePosition = true;

  const element = document.elementFromPoint(e.clientX, e.clientY);
  if (element && element !== currentHoverElement) {
    currentHoverElement = element;
    if (translateModeActive) {
      checkAndTranslate();
    }
  }
}

// 使用 pointermove 替代 mousemove，支持触摸设备且更早触发
document.addEventListener('pointermove', updateMousePosition, { passive: true });

document.addEventListener('pointerover', (e) => {
  if (e.target instanceof Element && e.target !== currentHoverElement) {
    currentHoverElement = e.target;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    hasMousePosition = true;
  }
}, { passive: true });

/**
 * 初始化鼠标追踪
 * 解决页面加载时鼠标已在页面上但未触发事件的问题
 */
function initMouseTracking(): void {
  if (hasMousePosition) return;

  // 一次性监听，捕获第一次鼠标移动
  const onFirstMove = (e: MouseEvent) => {
    if (!hasMousePosition) {
      updateMousePosition(e);
    }
    document.removeEventListener('mousemove', onFirstMove, true);
  };
  document.addEventListener('mousemove', onFirstMove, { capture: true, passive: true });
}

// 延迟初始化，确保 DOM 完全加载
if (document.readyState === 'complete') {
  initMouseTracking();
} else {
  window.addEventListener('load', initMouseTracking);
}

/**
 * 尝试从已记录的鼠标位置或 activeElement 中恢复当前悬停元素
 * 在用户按下快捷键时调用，弥补鼠标未移动时的盲区
 */
function ensureCurrentElement(): void {
  if (currentHoverElement) return;

  // 使用记录的最后鼠标坐标
  if (hasMousePosition && lastMouseX !== null && lastMouseY !== null) {
    currentHoverElement = document.elementFromPoint(lastMouseX, lastMouseY);
  }

  // 后备：使用当前聚焦的元素
  if (!currentHoverElement) {
    const activeElement = document.activeElement;
    if (activeElement && activeElement !== document.body && activeElement !== document.documentElement) {
      currentHoverElement = activeElement;
    }
  }
}

// ==================== 初始化日志 ====================

const isInIframe = window !== window.top;
console.log(`Samo 助手 Content Script 已加载${isInIframe ? ' (iframe)' : ''}`);

// iframe 内不初始化翻译、浮窗等功能，避免重复注入
if (!isInIframe) {
  loadTranslateConfig();
  initFloatButton();
}
