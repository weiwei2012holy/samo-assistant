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
const OVERLAY_MINIMIZE_ID = 'ai-sidebar-overlay-minimize';
const OVERLAY_HEADER_ID = 'ai-sidebar-overlay-header';
const OVERLAY_STATE_STORAGE_KEY = 'ai_sidebar_overlay_state';
const OVERLAY_EDGE_GAP = 6;
const OVERLAY_SNAP_THRESHOLD = 24;
const OVERLAY_EXPANDED_STATE_DATA_KEY = 'expandedState';

interface OverlayState {
  left: number;
  top: number;
  width: number;
  height: number;
  minimized: boolean;
}

function getDefaultOverlayState(): OverlayState {
  const width = Math.min(420, Math.max(320, window.innerWidth - 32));
  const height = Math.min(760, Math.max(420, window.innerHeight - 48));
  return {
    left: Math.max(8, window.innerWidth - width - 24),
    top: 24,
    width,
    height,
    minimized: false,
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
      resolve(state);
    });
  });
}

function saveOverlayState(state: OverlayState): void {
  chrome.storage.local.set({
    [OVERLAY_STATE_STORAGE_KEY]: state,
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('保存浮窗状态失败:', chrome.runtime.lastError);
    }
  });
}

function clampOverlayState(state: OverlayState): OverlayState {
  const minWidth = 320;
  const minHeight = 420;
  const maxWidth = Math.max(minWidth, window.innerWidth - 12);
  const maxHeight = Math.max(minHeight, window.innerHeight - 12);

  const width = Math.min(Math.max(state.width, minWidth), maxWidth);
  const height = Math.min(Math.max(state.height, minHeight), maxHeight);
  const left = Math.min(
    Math.max(state.left, OVERLAY_EDGE_GAP),
    Math.max(OVERLAY_EDGE_GAP, window.innerWidth - width - OVERLAY_EDGE_GAP),
  );
  const top = Math.min(
    Math.max(state.top, OVERLAY_EDGE_GAP),
    Math.max(OVERLAY_EDGE_GAP, window.innerHeight - height - OVERLAY_EDGE_GAP),
  );

  return {
    left,
    top,
    width,
    height,
    minimized: !!state.minimized,
  };
}

/**
 * 拖拽结束后吸附到屏幕边缘，提升停靠体验
 */
function snapOverlayState(state: OverlayState): OverlayState {
  const normalized = clampOverlayState(state);
  const rightGap = window.innerWidth - (normalized.left + normalized.width);
  const bottomGap = window.innerHeight - (normalized.top + normalized.height);

  let snappedLeft = normalized.left;
  let snappedTop = normalized.top;

  if (Math.abs(normalized.left - OVERLAY_EDGE_GAP) <= OVERLAY_SNAP_THRESHOLD) {
    snappedLeft = OVERLAY_EDGE_GAP;
  } else if (Math.abs(rightGap - OVERLAY_EDGE_GAP) <= OVERLAY_SNAP_THRESHOLD) {
    snappedLeft = Math.max(OVERLAY_EDGE_GAP, window.innerWidth - normalized.width - OVERLAY_EDGE_GAP);
  }

  if (Math.abs(normalized.top - OVERLAY_EDGE_GAP) <= OVERLAY_SNAP_THRESHOLD) {
    snappedTop = OVERLAY_EDGE_GAP;
  } else if (Math.abs(bottomGap - OVERLAY_EDGE_GAP) <= OVERLAY_SNAP_THRESHOLD) {
    snappedTop = Math.max(OVERLAY_EDGE_GAP, window.innerHeight - normalized.height - OVERLAY_EDGE_GAP);
  }

  return {
    ...normalized,
    left: snappedLeft,
    top: snappedTop,
  };
}

function readOverlayStateFromElement(container: HTMLDivElement): OverlayState {
  const rect = container.getBoundingClientRect();
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    minimized: container.classList.contains('ai-sidebar-overlay-minimized'),
  };
}

function setExpandedOverlayState(container: HTMLDivElement, state: OverlayState): void {
  const expanded = clampOverlayState({
    ...state,
    minimized: false,
  });
  container.dataset[OVERLAY_EXPANDED_STATE_DATA_KEY] = JSON.stringify(expanded);
}

function getExpandedOverlayState(container: HTMLDivElement): OverlayState | null {
  const raw = container.dataset[OVERLAY_EXPANDED_STATE_DATA_KEY];
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as OverlayState;
    return clampOverlayState({
      ...parsed,
      minimized: false,
    });
  } catch (error) {
    console.error('解析浮窗展开态快照失败:', error);
    return null;
  }
}

function updateMinimizeButton(container: HTMLDivElement): void {
  const minimizeBtn = container.querySelector(`#${OVERLAY_MINIMIZE_ID}`) as HTMLButtonElement | null;
  if (!minimizeBtn) return;

  const minimized = container.classList.contains('ai-sidebar-overlay-minimized');
  minimizeBtn.textContent = minimized ? '□' : '−';
  minimizeBtn.title = minimized ? '恢复助手' : '最小化助手';
}

function toggleOverlayMinimize(container: HTMLDivElement): void {
  const willMinimize = !container.classList.contains('ai-sidebar-overlay-minimized');

  if (willMinimize) {
    // 最小化前缓存展开态完整快照
    setExpandedOverlayState(container, readOverlayStateFromElement(container));
    container.classList.add('ai-sidebar-overlay-minimized');
  } else {
    container.classList.remove('ai-sidebar-overlay-minimized');
    const expandedState = getExpandedOverlayState(container);
    if (expandedState) {
      applyOverlayState(container, { ...expandedState, minimized: false });
    }
  }

  updateMinimizeButton(container);
  saveOverlayState(getPersistedOverlayState(container));
}

function applyOverlayState(
  container: HTMLDivElement,
  state: OverlayState,
  updateExpandedSnapshot: boolean = true,
): void {
  const normalized = clampOverlayState(state);

  container.style.left = `${normalized.left}px`;
  container.style.top = `${normalized.top}px`;
  container.style.width = `${normalized.width}px`;
  container.style.height = `${normalized.height}px`;
  container.style.right = 'auto';
  container.style.bottom = 'auto';

  if (normalized.minimized) {
    container.classList.add('ai-sidebar-overlay-minimized');
  } else {
    container.classList.remove('ai-sidebar-overlay-minimized');
    // 拖拽过程中不需要每帧写快照，避免卡顿
    if (updateExpandedSnapshot) {
      // 仅在展开态更新展开快照，避免最小化时写入 44px
      setExpandedOverlayState(container, normalized);
    }
  }
  updateMinimizeButton(container);
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

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      toggleOverlayMinimize(container);
    });
  }

  if (header) {
    header.addEventListener('mousedown', (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest('button')) return;

      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = rect.left;
      const startTop = rect.top;
      const baseState = readOverlayStateFromElement(container);
      let pendingDeltaX = 0;
      let pendingDeltaY = 0;
      let rafId: number | null = null;

      container.classList.remove('ai-sidebar-overlay-snapping-x');
      container.classList.remove('ai-sidebar-overlay-snapping-y');
      container.classList.add('ai-sidebar-overlay-dragging');

      const flushDragFrame = (): void => {
        rafId = null;
        container.style.transform = `translate3d(${pendingDeltaX}px, ${pendingDeltaY}px, 0)`;
      };

      const onMouseMove = (moveEvent: MouseEvent): void => {
        pendingDeltaX = moveEvent.clientX - startX;
        pendingDeltaY = moveEvent.clientY - startY;

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

        container.style.transform = '';

        const releasedState = {
          ...baseState,
          left: startLeft + pendingDeltaX,
          top: startTop + pendingDeltaY,
          minimized: container.classList.contains('ai-sidebar-overlay-minimized'),
        };

        // 先把元素落位到“松手时的位置”，保证后续吸边动画方向正确
        const releasedClampedState = clampOverlayState(releasedState);
        applyOverlayState(container, releasedClampedState, false);

        // 拖拽结束后执行吸边并持久化
        const snappedState = snapOverlayState(releasedClampedState);

        // 仅在“松手时越界”时触发回弹动画；X/Y 轴分别处理
        const animateX = Math.abs(releasedState.left - releasedClampedState.left) > 1;
        const animateY = Math.abs(releasedState.top - releasedClampedState.top) > 1;
        const shouldAnimateSnap = animateX || animateY;

        if (shouldAnimateSnap) {
          container.classList.remove('ai-sidebar-overlay-dragging');
          if (animateX) {
            container.classList.add('ai-sidebar-overlay-snapping-x');
          }
          if (animateY) {
            container.classList.add('ai-sidebar-overlay-snapping-y');
          }

          // 强制浏览器提交“松手位置”样式，再执行吸附动画
          void container.offsetWidth;
        }

        applyOverlayState(container, snappedState);
        saveOverlayState(snappedState);

        if (shouldAnimateSnap) {
          window.setTimeout(() => {
            container.classList.remove('ai-sidebar-overlay-snapping-x');
            container.classList.remove('ai-sidebar-overlay-snapping-y');
          }, 140);
        } else {
          container.classList.remove('ai-sidebar-overlay-dragging');
        }
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // 双击标题栏快速最小化/恢复
    header.addEventListener('dblclick', (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('button')) return;
      toggleOverlayMinimize(container);
    });
  }

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      if (container.classList.contains('ai-sidebar-overlay-minimized')) {
        return;
      }
      const currentState = readOverlayStateFromElement(container);
      setExpandedOverlayState(container, currentState);
      saveOverlayState(currentState);
    });
    observer.observe(container);
  }

  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      container.classList.add('ai-sidebar-overlay-hidden');
    }
  });

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

  const title = document.createElement('span');
  title.className = 'ai-sidebar-overlay-title';
  title.textContent = 'Samo 助手';

  const actions = document.createElement('div');
  actions.className = 'ai-sidebar-overlay-actions';

  // 清空按钮
  const clearBtn = document.createElement('button');
  clearBtn.id = 'ai-sidebar-overlay-clear-btn';
  clearBtn.className = 'ai-sidebar-overlay-action-btn';
  clearBtn.setAttribute('aria-label', '清空对话');
  clearBtn.textContent = '⟲';
  clearBtn.title = '清空对话';

  // 设置按钮
  const settingsBtn = document.createElement('button');
  settingsBtn.id = 'ai-sidebar-overlay-settings-btn';
  settingsBtn.className = 'ai-sidebar-overlay-action-btn';
  settingsBtn.setAttribute('aria-label', '设置');
  settingsBtn.textContent = '⚙';
  settingsBtn.title = '设置';

  const closeBtn = document.createElement('button');
  closeBtn.id = OVERLAY_CLOSE_ID;
  closeBtn.className = 'ai-sidebar-overlay-action-btn';
  closeBtn.textContent = '×';
  closeBtn.title = '最小化';
  closeBtn.setAttribute('aria-label', '最小化');

  const iframe = document.createElement('iframe');
  iframe.id = OVERLAY_IFRAME_ID;
  iframe.className = 'ai-sidebar-overlay-iframe';
  iframe.src = buildOverlayUrl(tabId);
  iframe.setAttribute('title', 'Samo 助手');
  iframe.setAttribute('loading', 'eager');

  actions.appendChild(clearBtn);
  actions.appendChild(settingsBtn);
  actions.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(actions);

  container.appendChild(header);
  container.appendChild(iframe);
  document.body.appendChild(container);

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

  container.classList.remove('ai-sidebar-overlay-minimized');
  updateMinimizeButton(container);
  container.classList.remove('ai-sidebar-overlay-hidden');
  saveOverlayState(getPersistedOverlayState(container));
}

function getPersistedOverlayState(container: HTMLDivElement): OverlayState {
  const visualState = readOverlayStateFromElement(container);
  if (!visualState.minimized) {
    return visualState;
  }

  const expandedState = getExpandedOverlayState(container);
  if (!expandedState) {
    return visualState;
  }

  return {
    ...expandedState,
    left: visualState.left,
    top: visualState.top,
    minimized: true,
  };
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

  // 主按钮 - 使用萨摩耶图标 (48x48)
  const mainBtn = document.createElement('button');
  mainBtn.className = 'ai-sidebar-float-main';
  mainBtn.draggable = false;
  mainBtn.innerHTML = `<img src="data:image/png;base64,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" alt="AI 助手">`;
  mainBtn.title = 'Samo 助手';
  mainBtn.setAttribute('aria-label', 'Samo 助手');
  const mainBtnImage = mainBtn.querySelector('img');
  if (mainBtnImage) {
    mainBtnImage.draggable = false;
  }

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

    // 检查 overlay 当前可见状态
    const overlayContainer = document.getElementById(OVERLAY_CONTAINER_ID) as HTMLDivElement | null;
    const isOverlayOpen = overlayContainer && !overlayContainer.classList.contains('ai-sidebar-overlay-hidden');

    if (isOverlayOpen) {
      // 已打开：切换隐藏/展开
      if (overlayContainer!.classList.contains('ai-sidebar-overlay-minimized')) {
        // 从最小化恢复
        toggleOverlayMinimize(overlayContainer!);
      } else {
        // 隐藏 overlay
        overlayContainer!.classList.add('ai-sidebar-overlay-hidden');
      }
    } else if (overlayContainer) {
      // 容器已存在但当前隐藏：仅恢复显示，不再触发首次动作
      overlayContainer.classList.remove('ai-sidebar-overlay-hidden');

      // 如果当前是最小化态，则恢复为展开态
      if (overlayContainer.classList.contains('ai-sidebar-overlay-minimized')) {
        toggleOverlayMinimize(overlayContainer);
      }

      saveOverlayState(getPersistedOverlayState(overlayContainer));
    } else {
      // 容器不存在：首次打开，向后台脚本发送消息并按配置执行动作
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

initFloatButton();

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

// 初始化时立即加载配置
loadTranslateConfig();

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
 * 策略：从当前元素向上遍历，优先选择块级语义元素；
 *   对于 DIV 等容器，判断文本长度和子元素结构决定是否合适
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
  // 内联元素（不适合直接翻译，需向上查找块级容器）
  const inlineElements = ['SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'CODE',
    'MARK', 'SMALL', 'SUB', 'SUP', 'LABEL'];

  let el: Element | null = startElement;

  while (el && el !== document.body) {
    // 跳过翻译结果容器
    if (el.classList?.contains('ai-sidebar-translation')) {
      return null;
    }

    const tagName = el.tagName;

    // 明确的块级段落元素，直接返回
    if (blockParagraphs.includes(tagName)) {
      return el;
    }

    // 内联元素，继续向上查找
    if (inlineElements.includes(tagName)) {
      el = el.parentElement;
      continue;
    }

    // 容器元素（如 DIV），判断是否适合作为翻译段落
    if (containerElements.includes(tagName)) {
      const text = (el as HTMLElement).innerText?.trim() || '';

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
 * @param target - 翻译目标
 * @param isLoading - 是否显示加载中状态
 * @returns 翻译结果容器元素
 */
function showTranslation(target: TranslateTarget, isLoading = false): HTMLElement {
  // 查找合适的块级插入位置（内联元素需要向上找到块级父元素）
  const insertTarget = findBlockParent(target.element);

  // 移除同一位置的旧翻译结果（避免堆积）
  const existingTranslation = insertTarget?.nextElementSibling;
  if (existingTranslation?.classList?.contains('ai-sidebar-translation')) {
    existingTranslation.remove();
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

  if (insertTarget) {
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
 * 查找合适的块级父元素，用于插入翻译结果
 * 如果目标元素是内联元素，向上查找到第一个块级祖先
 */
function findBlockParent(element: Element): Element {
  const inlineElements = ['A', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'CODE',
    'MARK', 'SMALL', 'SUB', 'SUP', 'LABEL', 'ABBR',
    'CITE', 'DFN', 'KBD', 'SAMP', 'VAR', 'TIME'];

  let el: Element | null = element;

  while (el && el !== document.body) {
    if (!inlineElements.includes(el.tagName)) {
      return el;
    }
    el = el.parentElement;
  }

  return element; // 未找到块级父元素，返回原始元素作为后备
}

/**
 * 更新翻译容器中的文本内容，并清除加载状态样式
 */
function updateTranslationContent(container: HTMLElement, content: string): void {
  const contentEl = container.querySelector('.ai-sidebar-translation-content');
  if (contentEl) {
    contentEl.textContent = content;
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
