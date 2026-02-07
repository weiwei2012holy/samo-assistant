/**
 * @Author wei
 * @Date 2026-02-07
 * @Description Chrome 扩展 Service Worker，处理扩展生命周期、右键菜单和消息通信
 **/

// 存储待处理的任务
let pendingTask = null;

// 点击扩展图标时打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
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
 * 向侧边栏发送任务
 * @param {Object} task - 任务对象
 * @param {number} tabId - 标签页 ID
 */
async function sendTaskToSidepanel(task, tabId) {
  // 存储任务（供侧边栏初始化时获取）
  pendingTask = task;

  // 打开侧边栏
  await chrome.sidePanel.open({ tabId: tabId });

  // 延迟发送消息，确保侧边栏已加载
  setTimeout(() => {
    chrome.runtime.sendMessage({
      type: 'EXECUTE_TASK',
      task: task
    }).catch(() => {
      // 侧边栏可能还没准备好，忽略错误
      console.log('侧边栏未准备好，任务将在初始化时执行');
    });
  }, 300);
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
    pendingTask = null; // 获取后清空
    sendResponse(task);
    return true;
  }

  // 从浮窗触发的操作
  if (message.type === 'FLOAT_ACTION') {
    const tab = sender.tab;
    if (!tab?.id) return;

    if (message.action === 'open_sidebar') {
      chrome.sidePanel.open({ tabId: tab.id });
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
});
