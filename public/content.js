/**
 * @Author wei
 * @Date 2026-02-07
 * @Description Content Script，用于提取页面内容和显示浮窗按钮
 **/

// ==================== 浮窗按钮功能 ====================

// 创建浮窗按钮
function createFloatButton() {
  // 检查是否已存在
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
  mainBtn.innerHTML = `<img src="data:image/png;base64,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" alt="AI 助手">`;
  mainBtn.title = 'AI 助手';

  // 展开菜单
  const menu = document.createElement('div');
  menu.className = 'ai-sidebar-float-menu';

  // 打开侧边栏按钮
  const openBtn = document.createElement('button');
  openBtn.className = 'ai-sidebar-float-menu-item';
  openBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="9" y1="3" x2="9" y2="21"></line>
    </svg>
    <span class="ai-sidebar-tooltip">打开侧边栏</span>
  `;
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'FLOAT_ACTION', action: 'open_sidebar' });
    hideMenu();
  });

  // 总结页面按钮
  const summarizeBtn = document.createElement('button');
  summarizeBtn.className = 'ai-sidebar-float-menu-item';
  summarizeBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
    <span class="ai-sidebar-tooltip">总结页面</span>
  `;
  summarizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'FLOAT_ACTION', action: 'summarize' });
    hideMenu();
  });

  menu.appendChild(openBtn);
  menu.appendChild(summarizeBtn);

  floatContainer.appendChild(menu);
  floatContainer.appendChild(mainBtn);

  document.body.appendChild(floatContainer);

  // 菜单状态
  let menuVisible = false;

  function showMenu() {
    menu.classList.add('visible');
    mainBtn.classList.add('active');
    menuVisible = true;
  }

  function hideMenu() {
    menu.classList.remove('visible');
    mainBtn.classList.remove('active');
    menuVisible = false;
  }

  function toggleMenu() {
    if (menuVisible) {
      hideMenu();
    } else {
      showMenu();
    }
  }

  // 点击主按钮切换菜单
  mainBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  // 点击外部关闭菜单
  document.addEventListener('click', () => {
    if (menuVisible) {
      hideMenu();
    }
  });

  // 拖拽功能
  let isDragging = false;
  let startX, startY, startLeft, startBottom;

  mainBtn.addEventListener('mousedown', (e) => {
    // 只响应左键
    if (e.button !== 0) return;

    isDragging = false;
    startX = e.clientX;
    startY = e.clientY;

    const rect = floatContainer.getBoundingClientRect();
    startLeft = rect.left;
    startBottom = window.innerHeight - rect.bottom;

    const onMouseMove = (e) => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      // 如果移动超过 5px，认为是拖拽
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        isDragging = true;

        let newLeft = startLeft + deltaX;
        let newBottom = startBottom - deltaY;

        // 边界限制
        const maxLeft = window.innerWidth - floatContainer.offsetWidth - 10;
        const maxBottom = window.innerHeight - floatContainer.offsetHeight - 10;

        newLeft = Math.max(10, Math.min(newLeft, maxLeft));
        newBottom = Math.max(10, Math.min(newBottom, maxBottom));

        floatContainer.style.left = newLeft + 'px';
        floatContainer.style.right = 'auto';
        floatContainer.style.bottom = newBottom + 'px';
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // 如果是拖拽，阻止点击事件
      if (isDragging) {
        setTimeout(() => {
          isDragging = false;
        }, 0);
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // 阻止拖拽时的点击
  mainBtn.addEventListener('click', (e) => {
    if (isDragging) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
}

// 页面加载后创建浮窗
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createFloatButton);
} else {
  createFloatButton();
}

// ==================== 页面内容提取功能 ====================

// 监听来自 background 或 sidepanel 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_CONTENT') {
    const content = extractPageContent();
    sendResponse(content);
  }
  return true;
});

/**
 * 提取页面的主要文本内容
 * @returns {Object} 包含标题、URL、内容的对象
 */
function extractPageContent() {
  // 获取页面标题
  const title = document.title || '';

  // 获取页面 URL
  const url = window.location.href;

  // 获取页面主要内容
  let content = '';

  // 尝试获取 article 标签内容
  const article = document.querySelector('article');
  if (article) {
    content = cleanText(article.innerText);
  } else {
    // 尝试获取 main 标签内容
    const main = document.querySelector('main');
    if (main) {
      content = cleanText(main.innerText);
    } else {
      // 获取 body 内容，排除 script、style、nav、footer 等
      content = extractBodyContent();
    }
  }

  // 获取页面描述
  const metaDescription = document.querySelector('meta[name="description"]');
  const description = metaDescription ? metaDescription.getAttribute('content') : '';

  return {
    title,
    url,
    description,
    content: content.slice(0, 50000), // 限制内容长度
    timestamp: Date.now()
  };
}

/**
 * 清理文本，移除多余空白
 * @param {string} text - 原始文本
 * @returns {string} 清理后的文本
 */
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

/**
 * 从 body 中提取主要内容，排除非内容元素
 * @returns {string} 提取的文本内容
 */
function extractBodyContent() {
  // 克隆 body 以避免修改原始 DOM
  const bodyClone = document.body.cloneNode(true);

  // 移除不需要的元素
  const selectorsToRemove = [
    'script', 'style', 'nav', 'footer', 'header',
    'aside', 'iframe', 'noscript', 'svg', 'form',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    '.nav', '.navbar', '.footer', '.header', '.sidebar',
    '.advertisement', '.ad', '.ads', '.social-share',
    '#ai-sidebar-float-btn' // 移除浮窗按钮
  ];

  selectorsToRemove.forEach(selector => {
    try {
      bodyClone.querySelectorAll(selector).forEach(el => el.remove());
    } catch (e) {
      // 忽略无效选择器
    }
  });

  return cleanText(bodyClone.innerText);
}

console.log('AI Sidebar Content Script 已加载');
