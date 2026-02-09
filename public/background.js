/**
 * @Author wei
 * @Date 2026-02-07
 * @Description Chrome 扩展 Service Worker，处理扩展生命周期、右键菜单和消息通信
 **/

// 存储待处理的任务
let pendingTask = null;

// 存储每个标签页的侧边栏连接（用于检测侧边栏是否打开）
const sidePanelConnections = new Map();

// 监听侧边栏连接
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel') {
    // 监听侧边栏发送的消息
    port.onMessage.addListener((message) => {
      if (message.type === 'SIDEPANEL_OPEN' && message.tabId) {
        const tabId = message.tabId;
        sidePanelConnections.set(tabId, port);
        console.log('侧边栏已连接, tabId:', tabId);

        // 监听断开连接
        port.onDisconnect.addListener(() => {
          sidePanelConnections.delete(tabId);
          console.log('侧边栏已断开, tabId:', tabId);
        });
      }
    });
  }
});

/**
 * 检查侧边栏是否打开
 * @param {number} tabId - 标签页 ID
 * @returns {boolean}
 */
function isSidePanelOpen(tabId) {
  return sidePanelConnections.has(tabId);
}

/**
 * 打开侧边栏（必须在用户手势的同步上下文中调用）
 * @param {number} windowId - 窗口 ID
 */
function openSidePanel(windowId) {
  chrome.sidePanel.open({ windowId }).catch((error) => {
    console.error('打开侧边栏失败:', error);
  });
}

// 监听标签页关闭，清理状态
chrome.tabs.onRemoved.addListener((tabId) => {
  sidePanelConnections.delete(tabId);
});

// 监听标签页切换，根据该 tab 是否打开过侧边栏来控制显示
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tabId = activeInfo.tabId;

  // 检查该 tab 是否有侧边栏连接（即之前打开过侧边栏）
  if (!sidePanelConnections.has(tabId)) {
    // 该 tab 没有打开过侧边栏，尝试关闭它
    // 注意：先禁用再启用可以关闭侧边栏，但保持可以被打开的状态
    try {
      await chrome.sidePanel.setOptions({ tabId, enabled: false });
      // 立即重新启用，这样用户还可以手动打开
      setTimeout(async () => {
        await chrome.sidePanel.setOptions({ tabId, enabled: true });
      }, 100);
    } catch (e) {
      console.log('关闭侧边栏失败:', e);
    }
  }
});

// 点击扩展图标时打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId) {
    openSidePanel(tab.windowId);
  }
});

// 扩展安装时创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  // 创建父菜单
  chrome.contextMenus.create({
    id: 'ai-sidebar-parent',
    title: 'AI 助手',
    contexts: ['selection']
  });

  // 翻译选中内容
  chrome.contextMenus.create({
    id: 'ai-translate',
    parentId: 'ai-sidebar-parent',
    title: '翻译选中内容',
    contexts: ['selection']
  });

  // 解释选中内容
  chrome.contextMenus.create({
    id: 'ai-explain',
    parentId: 'ai-sidebar-parent',
    title: '解释选中内容',
    contexts: ['selection']
  });

  // 总结选中内容
  chrome.contextMenus.create({
    id: 'ai-summarize-selection',
    parentId: 'ai-sidebar-parent',
    title: '总结选中内容',
    contexts: ['selection']
  });

  // 分隔线
  chrome.contextMenus.create({
    id: 'ai-separator',
    parentId: 'ai-sidebar-parent',
    type: 'separator',
    contexts: ['selection']
  });

  // 在侧边栏中提问
  chrome.contextMenus.create({
    id: 'ai-ask',
    parentId: 'ai-sidebar-parent',
    title: '在侧边栏中提问',
    contexts: ['selection']
  });

  console.log('AI Sidebar 扩展已安装，右键菜单已创建');
});

/**
 * 向侧边栏发送任务（必须在用户手势的同步上下文中调用）
 * @param {Object} task - 任务对象
 * @param {number} windowId - 窗口 ID
 */
function sendTaskToSidepanel(task, windowId) {
  pendingTask = task;

  chrome.sidePanel.open({ windowId })
    .then(() => {
      setTimeout(() => {
        chrome.runtime.sendMessage({
          type: 'EXECUTE_TASK',
          task: task
        }).then(() => {
          pendingTask = null;
        }).catch(() => {
          console.log('侧边栏未准备好，任务将在初始化时执行');
        });
      }, 300);
    })
    .catch((error) => {
      console.error('打开侧边栏失败:', error);
    });
}

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  const selectedText = info.selectionText || '';

  // 根据菜单项设置任务类型
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
      taskType = 'ask';
      prompt = selectedText;
      break;
    default:
      return;
  }

  // 发送任务到侧边栏
  sendTaskToSidepanel({
    type: taskType,
    text: selectedText,
    prompt: prompt,
    timestamp: Date.now()
  }, tab.windowId);
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

  // 获取待处理任务
  if (message.type === 'GET_PENDING_TASK') {
    const task = pendingTask;
    pendingTask = null; // 获取后清空
    sendResponse(task);
    return true;
  }

  // 从浮窗触发的操作
  if (message.type === 'FLOAT_ACTION') {
    const tab = sender.tab;
    if (!tab?.windowId) return;

    if (message.action === 'open_sidebar') {
      openSidePanel(tab.windowId);
    } else if (message.action === 'summarize') {
      sendTaskToSidepanel({
        type: 'summarize_page',
        prompt: '请总结这个页面的内容',
        timestamp: Date.now()
      }, tab.windowId);
    }
    sendResponse({ success: true });
    return true;
  }

  // 侧边栏通知当前 tab 已打开（用于 tab 切换时保持侧边栏状态）
  if (message.type === 'SIDEPANEL_TAB_ACTIVE') {
    const tabId = message.tabId;
    if (tabId) {
      // 创建一个虚拟的 port 来标记该 tab 已打开侧边栏
      // 由于 sidepanel 是全局共享的，需要记录所有打开过的 tab
      if (!sidePanelConnections.has(tabId)) {
        // 使用 tabId 作为标记，表示该 tab 的侧边栏是打开的
        sidePanelConnections.set(tabId, { active: true });
      }
      // 确保该 tab 的侧边栏已启用
      chrome.sidePanel.setOptions({ tabId, enabled: true });
    }
    sendResponse({ success: true });
    return true;
  }
});
