/**
 * @Author wei
 * @Date 2026-02-07
 * @Description Chrome 扩展 Service Worker，处理扩展生命周期、右键菜单和消息通信
 **/

// 存储待处理的任务
let pendingTask = null;

// 记录用户明确打开过侧边栏的 tab 集合（tab-specific 面板管理的核心）
const enabledTabs = new Set();

/**
 * 为指定 tab 启用侧边栏（同步版本，不返回 Promise）
 * @param {number} tabId
 */
function enableSidePanelForTab(tabId) {
  enabledTabs.add(tabId);
  chrome.sidePanel.setOptions({
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
  await chrome.sidePanel.setOptions({
    tabId,
    enabled: false
  });
}

/**
 * 打开侧边栏（必须在用户手势的同步上下文中调用）
 * 使用 tabId 确保是 tab-specific 面板，而非全局面板
 * @param {number} tabId
 */
function openSidePanel(tabId) {
  // 同步设置选项，然后立即打开（保持用户手势上下文）
  enableSidePanelForTab(tabId);
  chrome.sidePanel.open({ tabId }).catch((error) => {
    console.error('打开侧边栏失败:', error);
  });
}

// 扩展安装/更新时初始化
chrome.runtime.onInstalled.addListener(() => {
  // 禁用默认面板，防止新 tab 自动显示侧边栏
  chrome.sidePanel.setOptions({ enabled: false });

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

// 监听标签页关闭，清理状态
chrome.tabs.onRemoved.addListener((tabId) => {
  enabledTabs.delete(tabId);
});

// 监听新标签页创建，禁用其侧边栏
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await disableSidePanelForTab(tab.id);
  } catch (e) {}
});

// 监听标签页切换
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tabId = activeInfo.tabId;

  // 如果该 tab 不在已启用集合中，禁用其侧边栏
  if (!enabledTabs.has(tabId)) {
    try {
      await disableSidePanelForTab(tabId);
    } catch (e) {}
  }
  // 如果在集合中，Chrome 会自动恢复显示侧边栏
});

// 点击扩展图标时打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    openSidePanel(tab.id);
  }
});

/**
 * 向侧边栏发送任务（必须在用户手势的同步上下文中调用）
 * @param {Object} task - 任务对象
 * @param {number} tabId - 标签页 ID
 */
function sendTaskToSidepanel(task, tabId) {
  pendingTask = task;

  // 同步设置选项，保持用户手势上下文
  enableSidePanelForTab(tabId);
  
  chrome.sidePanel.open({ tabId })
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

  sendTaskToSidepanel({
    type: taskType,
    text: selectedText,
    prompt: prompt,
    timestamp: Date.now()
  }, tab.id);
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
    pendingTask = null;
    sendResponse(task);
    return true;
  }

  // 从浮窗触发的操作
  if (message.type === 'FLOAT_ACTION') {
    const tab = sender.tab;
    if (!tab?.id) return;

    if (message.action === 'open_sidebar') {
      openSidePanel(tab.id);
    } else if (message.action === 'summarize') {
      sendTaskToSidepanel({
        type: 'summarize_page',
        prompt: '请总结这个页面的内容',
        timestamp: Date.now()
      }, tab.id);
    }
    sendResponse({ success: true });
    return true;
  }

  // 侧边栏通知当前 tab 已打开
  if (message.type === 'SIDEPANEL_TAB_ACTIVE') {
    const tabId = message.tabId;
    if (tabId) {
      enabledTabs.add(tabId);
      chrome.sidePanel.setOptions({ tabId, enabled: true, path: 'sidepanel.html' });
    }
    sendResponse({ success: true });
    return true;
  }
});
