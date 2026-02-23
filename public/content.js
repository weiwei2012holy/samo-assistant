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
  mainBtn.title = 'Samo 助手';

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

// 页面加载后创建浮窗（仅在主页面，不在 iframe 中）
function initFloatButton() {
  // 检查是否在 iframe 中
  const isInIframe = window !== window.top;

  if (!isInIframe) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createFloatButton);
    } else {
      createFloatButton();
    }
  }
}

initFloatButton();

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

// ==================== 悬停翻译功能 ====================

// 翻译状态
let translateModeActive = false;
let currentHoverElement = null;
let translatingElement = null;
let translateShortcut = 'Control';
let providerConfig = null;
let configLoaded = false;  // 标记配置是否已加载完成
const translatedTexts = new Map();

// 加载翻译配置（返回 Promise 以支持等待）
function loadTranslateConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('ai_sidebar_settings', (result) => {
      const settings = result.ai_sidebar_settings || {};
      translateShortcut = settings.translateShortcut || 'Control';

      const currentProvider = settings.currentProvider || 'openai';
      providerConfig = settings.providerConfigs?.[currentProvider];
      configLoaded = true;

      console.log('翻译配置已加载:', { translateShortcut, provider: currentProvider });
      resolve();
    });
  });
}

// 监听配置变化
chrome.storage.onChanged.addListener((changes) => {
  if (changes.ai_sidebar_settings) {
    loadTranslateConfig();
  }
});

// 初始化加载配置
loadTranslateConfig();

// 获取翻译目标（选中文本优先，否则悬停段落）
function getTranslateTarget() {
  // 优先：选中文本
  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 0) {
    const text = selection.toString().trim();
    if (text.length > 0) {
      try {
        const range = selection.getRangeAt(0);
        const element = range.commonAncestorContainer.parentElement;

        // 检查选中的文本是否在翻译结果内部（防止套娃）
        if (isInsideTranslation(element)) {
          return null;
        }

        return {
          type: 'selection',
          text: text,
          anchor: range.cloneRange(),
          element: element
        };
      } catch (e) {
        // 忽略获取 range 的错误
      }
    }
  }

  // 其次：悬停的文本段落
  if (!currentHoverElement) return null;

  // 查找最合适的段落容器
  const bestParagraph = findBestParagraph(currentHoverElement);
  if (bestParagraph) {
    const text = bestParagraph.innerText?.trim();
    if (text && text.length > 0 && text.length < 5000) {
      return {
        type: 'element',
        text: text,
        element: bestParagraph
      };
    }
  }

  return null;
}

/**
 * 查找最合适的段落容器
 * 策略：从当前元素向上查找，优先选择块级段落元素，避免选中内联元素
 * @param {HTMLElement} startElement - 起始元素
 * @returns {HTMLElement|null} - 最合适的段落元素
 */
function findBestParagraph(startElement) {
  // 首先检查起始元素是否在翻译结果内部（防止套娃）
  if (isInsideTranslation(startElement)) {
    return null;
  }

  // 块级段落元素（优先级高）
  const blockParagraphs = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
                           'LI', 'BLOCKQUOTE', 'ARTICLE', 'SECTION'];
  // 可能的段落容器（需要进一步判断）
  const containerElements = ['DIV', 'TD', 'TH', 'DD', 'FIGCAPTION'];
  // 内联元素（应该向上查找其容器）
  const inlineElements = ['SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'CODE',
                          'MARK', 'SMALL', 'SUB', 'SUP', 'LABEL'];

  let el = startElement;

  while (el && el !== document.body) {
    // 跳过翻译元素
    if (el.classList?.contains('ai-sidebar-translation')) {
      return null;
    }

    const tagName = el.tagName;

    // 如果是明确的块级段落元素，直接返回
    if (blockParagraphs.includes(tagName)) {
      return el;
    }

    // 如果是内联元素，继续向上查找
    if (inlineElements.includes(tagName)) {
      el = el.parentElement;
      continue;
    }

    // 如果是容器元素（如 DIV），判断是否是合适的段落
    if (containerElements.includes(tagName)) {
      const text = el.innerText?.trim() || '';

      // 检查是否是合适的段落容器
      if (text.length > 0 && text.length < 5000) {
        // 关键改进：如果文本长度适中（< 500 字符），认为是一个"行"或"段落"
        // 即使有一些小的块级子元素，也优先选择它
        if (text.length < 500) {
          return el;
        }

        // 对于较长的文本，检查是否是"叶子"段落
        const hasBlockChildren = hasSignificantBlockChildren(el);
        if (!hasBlockChildren) {
          return el;
        }
        // 如果有显著的块级子元素，继续向上查找更好的容器
      }
    }

    el = el.parentElement;
  }

  return null;
}

/**
 * 检查元素是否在翻译结果内部
 * @param {HTMLElement} element - 要检查的元素
 * @returns {boolean} - 是否在翻译结果内部
 */
function isInsideTranslation(element) {
  let el = element;
  while (el && el !== document.body) {
    if (el.classList?.contains('ai-sidebar-translation')) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * 检查元素是否有显著的块级子元素
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function hasSignificantBlockChildren(element) {
  const blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
                     'UL', 'OL', 'LI', 'BLOCKQUOTE', 'ARTICLE', 'SECTION',
                     'TABLE', 'FORM', 'HEADER', 'FOOTER', 'NAV', 'ASIDE'];

  // 检查直接子元素中是否有多个块级元素
  let blockCount = 0;
  for (const child of element.children) {
    if (blockTags.includes(child.tagName)) {
      blockCount++;
      // 如果有超过1个块级子元素，认为这是一个大容器而不是段落
      if (blockCount > 1) {
        return true;
      }
    }
  }

  return false;
}

// 流式调用翻译 API
async function translateWithStream(text, onChunk) {
  if (!providerConfig?.apiKey) {
    throw new Error('未配置 API 密钥');
  }

  const baseUrl = providerConfig.baseUrl || 'https://api.openai.com/v1';
  const model = providerConfig.model || 'gpt-4o-mini';

  // 检测是否是 OpenRouter
  const isOpenRouter = baseUrl.includes('openrouter.ai');

  // 构建请求头
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${providerConfig.apiKey}`
  };

  // OpenRouter 需要额外的请求头
  if (isOpenRouter) {
    headers['HTTP-Referer'] = chrome.runtime.getURL('/');
    headers['X-Title'] = 'Samo Assistant';
  }

  console.log('翻译请求:', { baseUrl, model, isOpenRouter });

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: '你是一个翻译助手。将用户输入翻译成中文，如果已是中文则翻译成英文。只返回翻译结果，不要添加任何解释或前缀。'
        },
        { role: 'user', content: text }
      ],
      stream: true
    })
  });

  if (!response.ok) {
    // 尝试读取详细错误信息
    let errorDetail = '';
    try {
      const errorBody = await response.text();
      const errorJson = JSON.parse(errorBody);
      errorDetail = errorJson.error?.message || errorJson.message || errorBody;
    } catch (e) {
      errorDetail = response.statusText;
    }
    throw new Error(`模型: ${model}\n状态: ${response.status}\n错误: ${errorDetail}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

    for (const line of lines) {
      const data = line.replace(/^data:\s*/, '');
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          onChunk(fullContent);
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  }

  return fullContent;
}

// 显示翻译结果
function showTranslation(target, isLoading = false) {
  // 找到合适的插入位置（块级元素）
  const insertTarget = findBlockParent(target.element);

  // 移除同一元素的旧翻译
  const existingTranslation = insertTarget?.nextElementSibling;
  if (existingTranslation?.classList?.contains('ai-sidebar-translation')) {
    existingTranslation.remove();
  }

  // 创建翻译结果容器（简洁版，无标题）
  const container = document.createElement('div');
  container.className = 'ai-sidebar-translation';
  if (isLoading) {
    container.classList.add('ai-sidebar-translation-loading');
  }

  container.innerHTML = `
    <button class="ai-sidebar-translation-close" title="关闭">×</button>
    <div class="ai-sidebar-translation-content">${isLoading ? '翻译中...' : ''}</div>
  `;

  // 插入到块级元素下方
  if (insertTarget) {
    insertTarget.insertAdjacentElement('afterend', container);
  }

  // 关闭按钮事件
  container.querySelector('.ai-sidebar-translation-close')
    .addEventListener('click', (e) => {
      e.stopPropagation();
      container.remove();
    });

  return container;
}

/**
 * 查找合适的块级父元素用于插入翻译结果
 * @param {HTMLElement} element - 目标元素
 * @returns {HTMLElement} - 块级父元素
 */
function findBlockParent(element) {
  if (!element) return null;

  // 内联元素列表
  const inlineElements = ['A', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'CODE',
                          'MARK', 'SMALL', 'SUB', 'SUP', 'LABEL', 'ABBR',
                          'CITE', 'DFN', 'KBD', 'SAMP', 'VAR', 'TIME'];

  let el = element;

  // 如果当前元素是内联元素，向上查找块级父元素
  while (el && el !== document.body) {
    if (!inlineElements.includes(el.tagName)) {
      return el;
    }
    el = el.parentElement;
  }

  // 如果找不到合适的块级元素，返回原始元素
  return element;
}

// 更新翻译内容
function updateTranslationContent(container, content) {
  const contentEl = container.querySelector('.ai-sidebar-translation-content');
  if (contentEl) {
    contentEl.textContent = content;
  }
  container.classList.remove('ai-sidebar-translation-loading');
}

// 检查并执行翻译
async function checkAndTranslate() {
  if (!translateModeActive) return;

  // 等待配置加载完成
  if (!configLoaded) {
    await loadTranslateConfig();
  }

  const target = getTranslateTarget();
  if (!target) return;

  // 避免重复翻译同一元素
  if (translatingElement === target.element) return;

  // 检查缓存
  if (translatedTexts.has(target.text)) {
    const cachedTranslation = translatedTexts.get(target.text);
    const container = showTranslation(target);
    updateTranslationContent(container, cachedTranslation);
    return;
  }

  // 检查是否已经有翻译结果
  const existingTranslation = target.element?.nextElementSibling;
  if (existingTranslation?.classList?.contains('ai-sidebar-translation')) {
    return;
  }

  translatingElement = target.element;

  try {
    // 显示加载状态
    const container = showTranslation(target, true);

    // 流式翻译
    const translation = await translateWithStream(target.text, (content) => {
      updateTranslationContent(container, content);
    });

    // 缓存结果
    translatedTexts.set(target.text, translation);
  } catch (error) {
    console.error('翻译失败:', error);
    // 显示错误
    const existingContainer = target.element?.nextElementSibling;
    if (existingContainer?.classList?.contains('ai-sidebar-translation')) {
      updateTranslationContent(existingContainer, `翻译失败: ${error.message}`);
    }
  } finally {
    translatingElement = null;
  }
}

// 检查是否只按下了单个修饰键（没有其他键同时按下）
function isOnlyShortcutKey(e) {
  // 统计按下的修饰键数量
  const modifierCount = (e.ctrlKey ? 1 : 0) + (e.altKey ? 1 : 0) + (e.shiftKey ? 1 : 0) + (e.metaKey ? 1 : 0);
  // 必须只有一个修饰键，且不能有其他普通按键同时按下
  // e.key 为修饰键本身时才是单独按下
  const isModifierKey = ['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(e.key);
  
  if (modifierCount !== 1 || !isModifierKey) {
    return false;
  }
  
  // 检查是否是配置的快捷键
  switch (translateShortcut) {
    case 'Control':
      return e.ctrlKey;
    case 'Alt':
      return e.altKey;
    case 'Shift':
      return e.shiftKey;
    case 'Meta':
      return e.metaKey;
    default:
      return e.ctrlKey;
  }
}

// 快捷键延迟触发相关变量
let shortcutPressTimer = null;
const SHORTCUT_DELAY = 150;  // 按住快捷键 150ms 后才触发翻译

// 激活翻译模式
function activateTranslateMode() {
  if (translateModeActive) return;
    translateModeActive = true;
  document.body.classList.add('ai-sidebar-translate-mode');
    console.log('翻译模式已激活');
  ensureCurrentElement();
    // 如果仍然没有获取到元素（用户还没有移动过鼠标）
  // 添加一次性监听器，等待鼠标移动后自动翻译
  if (!currentHoverElement) {
    const onFirstInteraction = (ev) => {
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

// 取消翻译模式
function deactivateTranslateMode() {
  // 清除延迟定时器
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
// 快捷键监听
document.addEventListener('keydown', (e) => {
  // 检查是否只按下了配置的快捷键（单个修饰键，无其他按键）
  if (!isOnlyShortcutKey(e)) {
    // 如果按下了其他键（如 Ctrl+A），取消正在等待的翻译激活
    if (shortcutPressTimer) {
      clearTimeout(shortcutPressTimer);
      shortcutPressTimer = null;
      console.log('检测到组合键，取消翻译触发');
    }
    return;
  }
  
  // 如果已经在翻译模式或已有定时器，跳过
  if (translateModeActive || shortcutPressTimer) {
    return;
  }
  
  // 延迟激活翻译模式，避免与其他快捷键冲突
  shortcutPressTimer = setTimeout(() => {
    shortcutPressTimer = null;
    activateTranslateMode();
  }, SHORTCUT_DELAY);
  
  console.log(`快捷键按下，${SHORTCUT_DELAY}ms 后激活翻译模式...`);
}, true);  // 使用捕获阶段
document.addEventListener('keyup', (e) => {
  // 检查是否松开了快捷键
  const wasShortcutKey = (
    (translateShortcut === 'Control' && e.key === 'Control') ||
    (translateShortcut === 'Alt' && e.key === 'Alt') ||
    (translateShortcut === 'Shift' && e.key === 'Shift') ||
    (translateShortcut === 'Meta' && (e.key === 'Meta' || e.key === 'OS'))
  );

  if (wasShortcutKey) {
    deactivateTranslateMode();
  }
}, true);  // 使用捕获阶段

// 鼠标位置追踪
let lastMouseX = null;
let lastMouseY = null;
let hasMousePosition = false;

// 统一的鼠标位置更新函数
function updateMousePosition(e) {
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

// 使用 pointermove 替代 mousemove（更早触发，支持触摸设备）
document.addEventListener('pointermove', updateMousePosition, { passive: true });

// 使用 pointerover 捕获指针进入元素的事件
document.addEventListener('pointerover', (e) => {
  if (e.target && e.target !== currentHoverElement) {
    currentHoverElement = e.target;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    hasMousePosition = true;
  }
}, { passive: true });

// 页面加载后的一次性初始化：尝试通过模拟事件获取鼠标位置
// 这解决了页面加载时鼠标已在页面上但没有触发任何事件的问题
function initMouseTracking() {
  if (hasMousePosition) return;
  
  // 添加一个一次性的 mousemove 监听器来捕获第一次鼠标移动
  const onFirstMove = (e) => {
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

// 确保在按下快捷键时能获取到当前元素
function ensureCurrentElement() {
  if (currentHoverElement) return;
  
  // 如果有鼠标位置记录，尝试获取该位置的元素
  if (hasMousePosition && lastMouseX !== null && lastMouseY !== null) {
    currentHoverElement = document.elementFromPoint(lastMouseX, lastMouseY);
  }
  
  // 后备：使用 activeElement
  if (!currentHoverElement) {
    const activeElement = document.activeElement;
    if (activeElement && activeElement !== document.body && activeElement !== document.documentElement) {
      currentHoverElement = activeElement;
    }
  }
}

// 判断是否在 iframe 中
const isInIframe = window !== window.top;
console.log(`Samo 助手 Content Script 已加载${isInIframe ? ' (iframe)' : ''}`);
