/**
 * @Author wei
 * @Date 2026-07-16
 * @Description Chrome 扩展 Service Worker，处理扩展生命周期、右键菜单和消息通信，并修复不支持注入内容脚本页面的侧边栏打开问题
 **/

// 存储待处理的任务（附带时间戳，超过 8 秒视为过期）
let pendingTask = null;
const PENDING_TASK_TTL_MS = 8000;

// 设置存储键
const SETTINGS_STORAGE_KEY = 'ai_sidebar_settings';

// 当前助手打开模式：sidepanel | window | overlay
let assistantDisplayMode = 'overlay';

// 助手窗口 ID（窗口模式复用）
let assistantWindowId = null;

// 跟踪每个标签页的助手打开状态（用于浮窗按钮切换）
const tabAssistantOpenState = new Map();

/**
 * 规范化显示模式，确保只返回合法值
 * @param {string | undefined} mode
 * @returns {'sidepanel' | 'window' | 'overlay'}
 */
function normalizeDisplayMode(mode) {
  if (mode === 'sidepanel') return 'sidepanel';
  if (mode === 'window') return 'window';
  return 'overlay';
}

/**
 * 判断指定 URL 的页面是否不支持注入内容脚本（从而无法使用浮窗模式）
 * @param {string | undefined} url
 * @returns {boolean}
 */
function isUnsupportedInjectPage(url) {
  if (!url) return true;
  
  // 屏蔽 Chrome 内部协议页面
  if (url.startsWith('chrome://') || 
      url.startsWith('chrome-extension://') || 
      url.startsWith('chrome-search://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://')) {
    return true;
  }
  
  // 屏蔽 Chrome 网上应用店
  if (url.includes('chromewebstore.google.com') || 
      url.includes('chrome.google.com/webstore')) {
    return true;
  }
  
  return false;
}

// 记录用户明确打开过侧边栏的 tab 集合（tab-specific 面板管理的核心）
const enabledTabs = new Set();

/**
 * Service Worker 是短暂的，Chrome 会在空闲时将其终止，导致内存中的 enabledTabs 丢失。
 * 使用 chrome.storage.session 在整个浏览器会话内持久化 enabledTabs，
 * 确保 Service Worker 重启后能正确恢复状态，避免侧边栏被意外关闭。
 */

/** Service Worker 启动时从 session storage 恢复 enabledTabs 的 Promise */
const initPromise = chrome.storage.session.get('enabledTabs').then(data => {
  if (Array.isArray(data.enabledTabs)) {
    data.enabledTabs.forEach(id => enabledTabs.add(id));
    console.log('从 session storage 恢复 enabledTabs:', [...enabledTabs]);
  }
});

/** 从 sync storage 恢复助手显示模式 */
chrome.storage.sync.get(SETTINGS_STORAGE_KEY).then((data) => {
  const saved = data?.[SETTINGS_STORAGE_KEY];
  assistantDisplayMode = normalizeDisplayMode(saved?.assistantDisplayMode);
});

/** 监听设置变化，实时更新显示模式 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync' || !changes[SETTINGS_STORAGE_KEY]) return;

  const nextSettings = changes[SETTINGS_STORAGE_KEY].newValue;
  assistantDisplayMode = normalizeDisplayMode(nextSettings?.assistantDisplayMode);
});

/**
 * 将当前 enabledTabs 持久化到 session storage
 */
function persistEnabledTabs() {
  chrome.storage.session.set({ enabledTabs: [...enabledTabs] });
}

/**
 * 为指定 tab 启用侧边栏（返回 Promise，供切换流程 await）
 * @param {number} tabId
 * @returns {Promise<void>}
 */
async function enableSidePanelForTab(tabId) {
  enabledTabs.add(tabId);
  persistEnabledTabs();
  await chrome.sidePanel.setOptions({
    tabId,
    path: 'sidepanel.html',
    enabled: true
  });
}

/**
 * 为指定 tab 禁用侧边栏
 * @param {number} tabId
 */
async function disableSidePanelForTab(tabId) {
  enabledTabs.delete(tabId);
  persistEnabledTabs(); // 同步持久化
  await chrome.sidePanel.setOptions({
    tabId,
    enabled: false
  });
}

/**
 * 打开侧边栏
 * @param {number} tabId
 */
function openSidePanel(tabId) {
  enabledTabs.add(tabId);
  persistEnabledTabs();
  // 注意：sidePanel.open 必须在用户手势的同步上下文中调用
  // setOptions 和 open 都同步调用（不等待 Promise），确保用户手势上下文不丢失
  try {
    chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: true })
      .catch((error) => {
        console.error('启用并设置侧边栏选项失败:', error);
      });
    chrome.sidePanel.open({ tabId })
      .catch((error) => {
        console.error('执行打开侧边栏操作失败，可能是因为未在用户操作的同步上下文中调用:', error);
      });
  } catch (error) {
    console.error('打开侧边栏同步捕获失败:', error);
  }
}

/**
 * 构建助手窗口 URL（复用 sidepanel.html 页面）
 * @param {number} tabId
 * @returns {string}
 */
function buildAssistantWindowUrl(tabId) {
  const url = new URL(chrome.runtime.getURL('sidepanel.html'));
  url.searchParams.set('mode', 'window');
  url.searchParams.set('tabId', String(tabId));
  url.searchParams.set('ts', String(Date.now()));
  return url.toString();
}

/**
 * 打开页面内浮窗（overlay）
 * @param {number} tabId
 * @returns {Promise<void>}
 */
async function openAssistantOverlay(tabId) {
  await chrome.tabs.sendMessage(tabId, {
    type: 'OPEN_ASSISTANT_OVERLAY',
    tabId,
  });
}

/**
 * 打开或复用助手独立窗口
 * @param {number} tabId
 */
async function openAssistantWindow(tabId) {
  const targetUrl = buildAssistantWindowUrl(tabId);

  if (assistantWindowId !== null) {
    try {
      const existingWindow = await chrome.windows.get(assistantWindowId, { populate: true });
      const firstTab = existingWindow.tabs?.[0];
      if (firstTab?.id) {
        await chrome.tabs.update(firstTab.id, { url: targetUrl, active: true });
        await chrome.windows.update(assistantWindowId, { focused: true });
        return;
      }
    } catch (error) {
      assistantWindowId = null;
      console.warn('助手窗口复用失败，准备新建窗口:', error);
    }
  }

  const createdWindow = await chrome.windows.create({
    url: targetUrl,
    type: 'popup',
    width: 460,
    height: 760,
    focused: true,
  });
  assistantWindowId = createdWindow.id ?? null;
}

/**
 * 根据用户配置打开助手容器
 * @param {number} tabId
 * @param {string | undefined} url
 */
function openAssistantSurface(tabId, url) {
  tabAssistantOpenState.set(tabId, true);

  // 如果页面不支持注入内容脚本，且当前配置是 overlay，则降级为 sidepanel 模式
  let activeMode = assistantDisplayMode;
  if (activeMode === 'overlay' && isUnsupportedInjectPage(url)) {
    console.log('当前页面不支持注入脚本，自动将浮窗模式降级为侧边栏模式');
    activeMode = 'sidepanel';
  }

  if (activeMode === 'overlay') {
    openAssistantOverlay(tabId).catch((error) => {
      console.error('打开页面内浮窗失败，自动降级为侧边栏:', error);
      openSidePanel(tabId);
    });
    return;
  }

  if (activeMode === 'window') {
    openAssistantWindow(tabId).catch((error) => {
      console.error('打开独立窗口失败，自动降级为侧边栏:', error);
      openSidePanel(tabId);
    });
    return;
  }

  openSidePanel(tabId);
}

/**
 * 关闭助手容器
 * @param {number} tabId
 */
function closeAssistantSurface(tabId) {
  if (assistantDisplayMode === 'overlay') {
    chrome.tabs.sendMessage(tabId, { type: 'CLOSE_ASSISTANT_OVERLAY' }).catch(() => {});
    return;
  }

  if (assistantDisplayMode === 'window' && assistantWindowId !== null) {
    const windowToClose = assistantWindowId;
    assistantWindowId = null;
    chrome.windows.remove(windowToClose).catch(() => {});
    return;
  }

  // 侧边栏模式：Chrome 不提供编程关闭侧边栏的 API
  // 所以我们只更新状态，让用户手动关闭或下次点击时重新打开
  console.log('侧边栏模式：更新状态为关闭，但用户需要手动关闭侧边栏');
}

/**
 * 尝试向前端容器投递任务；失败时保留 pendingTask，等待 GET_PENDING_TASK 拉取
 * @param {Object} task
 * @param {number | null} tabId - 目标标签页 ID，overlay/window 模式下用于过滤消息
 */
function dispatchTaskToAssistant(task, tabId) {
  chrome.runtime.sendMessage({
    type: 'EXECUTE_TASK',
    task,
    tabId: tabId ?? null,
  }).then(() => {
    pendingTask = null;
  }).catch(() => {
    console.log('助手容器未准备好，任务将在初始化时执行');
  });
}

// 扩展安装/更新时初始化
chrome.runtime.onInstalled.addListener(() => {
  // 禁用默认面板，防止新 tab 自动显示侧边栏
  chrome.sidePanel.setOptions({ enabled: false });

  // 先移除现有菜单，防止重复创建报错
  chrome.contextMenus.removeAll(() => {
    // 创建右键菜单
    chrome.contextMenus.create({
      id: 'ai-sidebar-parent',
      title: 'Samo 助手',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'ai-translate',
      parentId: 'ai-sidebar-parent',
      title: '翻译选中内容',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'ai-explain',
      parentId: 'ai-sidebar-parent',
      title: '解释选中内容',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'ai-summarize-selection',
      parentId: 'ai-sidebar-parent',
      title: '总结选中内容',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'ai-separator',
      parentId: 'ai-sidebar-parent',
      type: 'separator',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'ai-ask',
      parentId: 'ai-sidebar-parent',
      title: '在侧边栏中提问',
      contexts: ['selection']
    });

    console.log('Samo 助手扩展已安装，右键菜单已创建');
  });
});

// 监听标签页关闭，清理状态
chrome.tabs.onRemoved.addListener((tabId) => {
  enabledTabs.delete(tabId);
  tabAssistantOpenState.delete(tabId);
  persistEnabledTabs(); // 同步持久化
});

// 监听新标签页创建，禁用其侧边栏
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await disableSidePanelForTab(tab.id);
  } catch (e) {
    console.error('新标签页禁用侧边栏失败:', e);
  }
});

// 监听标签页切换
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  // 等待初始化完成，确保 enabledTabs 已从 session storage 恢复
  await initPromise;

  const tabId = activeInfo.tabId;

  // 如果该 tab 不在已启用集合中，禁用其侧边栏
  if (!enabledTabs.has(tabId)) {
    try {
      await disableSidePanelForTab(tabId);
    } catch (e) {
      console.error('切换标签页后禁用侧边栏失败:', e);
    }
  }
  // 如果在集合中，Chrome 会自动恢复显示侧边栏
});

// 助手窗口关闭后清理复用状态
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === assistantWindowId) {
    assistantWindowId = null;
    // 窗口关闭，重置所有标签页的打开状态
    tabAssistantOpenState.clear();
  }
});

// 点击扩展图标时打开/切换侧边栏
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  const tabId = tab.id;

  // 如果是侧边栏模式，Chrome 没有提供关闭 API
  if (assistantDisplayMode === 'sidepanel') {
    openAssistantSurface(tabId, tab.url);
    tabAssistantOpenState.set(tabId, true);
    return;
  }

  // overlay 和 window 模式使用正常的切换逻辑
  const isOpen = tabAssistantOpenState.get(tabId) === true;
  if (isOpen) {
    closeAssistantSurface(tabId);
    tabAssistantOpenState.set(tabId, false);
  } else {
    openAssistantSurface(tabId, tab.url);
    tabAssistantOpenState.set(tabId, true);
  }
});

/**
 * 向助手容器发送任务（必须在用户手势的同步上下文中调用）
 * @param {Object} task - 任务对象
 * @param {number} tabId - 标签页 ID
 * @param {string | undefined} url - 标签页 URL
 */
function sendTaskToAssistant(task, tabId, url) {
  pendingTask = { ...task, _createdAt: Date.now() };

  // 如果页面不支持注入内容脚本，且当前配置是 overlay，则降级为 sidepanel 模式
  let activeMode = assistantDisplayMode;
  if (activeMode === 'overlay' && isUnsupportedInjectPage(url)) {
    console.log('当前页面不支持注入脚本，自动将浮窗模式降级为侧边栏模式进行任务投递');
    activeMode = 'sidepanel';
  }

  if (activeMode === 'overlay') {
    openAssistantOverlay(tabId)
      .then(() => {
        setTimeout(() => {
          dispatchTaskToAssistant(task, tabId);
        }, 120);
      })
      .catch((error) => {
        console.error('浮窗模式打开失败，回退侧边栏:', error);
        openSidePanel(tabId);
        setTimeout(() => {
          dispatchTaskToAssistant(task, tabId);
        }, 300);
      });
    return;
  }

  if (activeMode === 'window') {
    openAssistantWindow(tabId)
      .then(() => {
        setTimeout(() => {
          dispatchTaskToAssistant(task, tabId);
        }, 150);
      })
      .catch((error) => {
        console.error('窗口模式打开失败，回退侧边栏:', error);
        openSidePanel(tabId);
        setTimeout(() => {
          dispatchTaskToAssistant(task, tabId);
        }, 300);
      });
    return;
  }

  // 侧边栏模式：直接同步打开并启用
  openSidePanel(tabId);
  setTimeout(() => {
    dispatchTaskToAssistant(task, tabId);
  }, 300);
}

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  const selectedText = info.selectionText || '';
  let taskType = '';
  let prompt = '';

  switch (info.menuItemId) {
    case 'ai-translate':
      taskType = 'translate';
      prompt = `请将以下内容翻译成中文（如果已是中文则翻译成英文）：\n\n${selectedText}`;
      break;
    case 'ai-explain':
      taskType = 'explain';
      prompt = `请解释以下内容的含义：\n\n${selectedText}`;
      break;
    case 'ai-summarize-selection':
      taskType = 'summarize';
      prompt = `请总结以下内容的要点：\n\n${selectedText}`;
      break;
    case 'ai-ask':
      // 「在侧边栏中提问」：不直接发送，只传递选中文本，让用户输入问题后再发送
      taskType = 'ask';
      prompt = '';  // 不构造 prompt，由侧边栏让用户选择常用问题或手动输入
      break;
    default:
      return;
  }

  sendTaskToAssistant({
    type: taskType,
    text: selectedText,
    prompt: prompt,
    timestamp: Date.now()
  }, tab.id, tab.url);
});

// 监听来自 content script 或 sidepanel 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 获取页面内容
  if (message.type === 'GET_PAGE_CONTENT') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]?.id) {
        try {
          const response = await chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_CONTENT' });
          sendResponse(response);
        } catch (error) {
          sendResponse({ error: '无法获取页面内容' });
        }
      }
    });
    return true;
  }

  // 获取待处理任务（过期任务不返回）
  if (message.type === 'GET_PENDING_TASK') {
    const task = pendingTask;
    pendingTask = null;
    if (task && Date.now() - task._createdAt <= PENDING_TASK_TTL_MS) {
      const { _createdAt, ...taskData } = task;
      sendResponse(taskData);
    } else {
      sendResponse(null);
    }
    return true;
  }

  // 从浮窗触发的操作
  if (message.type === 'FLOAT_ACTION') {
    const tab = sender.tab;
    if (!tab?.id) return;

    const tabId = tab.id;
    const isOpen = tabAssistantOpenState.get(tabId) === true;

    // 如果是侧边栏模式，Chrome 没有提供关闭 API，所以我们的逻辑简化为：
    // - 每次点击都打开/刷新（如果是 summarize 动作则发送任务）
    // - 状态主要用于控制浮窗按钮的激活样式
    if (assistantDisplayMode === 'sidepanel') {
      if (message.action === 'open_sidebar') {
        openAssistantSurface(tabId, tab.url);
      } else if (message.action === 'summarize') {
        // 如果已经打开，只发送任务；否则打开并发送任务
        sendTaskToAssistant({
          type: 'summarize_page',
          prompt: '请总结这个页面的内容',
          timestamp: Date.now()
        }, tabId, tab.url);
      }
      // 对于侧边栏模式，我们简化状态管理：每次点击都认为是"打开"状态
      tabAssistantOpenState.set(tabId, true);
      sendResponse({ success: true, action: 'open' });
      return true;
    }

    // overlay 和 window 模式使用正常的切换逻辑
    if (isOpen) {
      // 已打开：关闭助手
      closeAssistantSurface(tabId);
      tabAssistantOpenState.set(tabId, false);
      sendResponse({ success: true, action: 'close' });
    } else {
      // 未打开：打开助手
      if (message.action === 'open_sidebar') {
        openAssistantSurface(tabId, tab.url);
      } else if (message.action === 'summarize') {
        sendTaskToAssistant({
          type: 'summarize_page',
          prompt: '请总结这个页面的内容',
          timestamp: Date.now()
        }, tabId, tab.url);
      }
      tabAssistantOpenState.set(tabId, true);
      sendResponse({ success: true, action: 'open' });
    }
    return true;
  }

  // 侧边栏通知当前 tab 已打开
  if (message.type === 'SIDEPANEL_TAB_ACTIVE') {
    if (assistantDisplayMode !== 'sidepanel') {
      sendResponse({ success: true });
      return true;
    }

    const tabId = message.tabId;
    if (tabId) {
      enabledTabs.add(tabId);
      chrome.sidePanel.setOptions({ tabId, enabled: true, path: 'sidepanel.html' });
    }
    sendResponse({ success: true });
    return true;
  }

  // 运行时切换显示模式（对话记录已持久化到 chrome.storage.local，切换后重新打开可恢复）
  if (message.type === 'SWITCH_DISPLAY_MODE') {
    const { mode } = message;
    const tabId = sender.tab?.id ?? message.tabId;
    if (!mode || !tabId) {
      sendResponse({ success: false });
      return true;
    }

    const newMode = normalizeDisplayMode(mode);
    const prevMode = assistantDisplayMode;

    // 如果模式未变，什么都不做
    if (prevMode === newMode) {
      sendResponse({ success: true });
      return true;
    }

    assistantDisplayMode = newMode;

    // 持久化到 sync storage
    chrome.storage.sync.get(SETTINGS_STORAGE_KEY, (data) => {
      const settings = data?.[SETTINGS_STORAGE_KEY] || {};
      chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: { ...settings, assistantDisplayMode: newMode } });
    });

    // 关闭旧容器（fire-and-forget，不阻塞新容器的打开）
    if (prevMode === 'overlay') {
      chrome.tabs.sendMessage(tabId, { type: 'CLOSE_ASSISTANT_OVERLAY' }).catch(() => {});
    } else if (prevMode === 'window' && assistantWindowId !== null) {
      const windowToClose = assistantWindowId;
      assistantWindowId = null;
      chrome.windows.remove(windowToClose).catch(() => {});
    } else if (prevMode === 'sidepanel') {
      disableSidePanelForTab(tabId).catch(() => {});
    }

    // 直接打开新容器
    openAssistantSurface(tabId, sender.tab?.url);

    sendResponse({ success: true });
    return true;
  }
});
