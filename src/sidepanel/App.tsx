/**
 * @Author wei
 * @Date 2026-07-16
 * @Description 侧边栏主应用组件 - 负责组装各子模块，新增了猜你想问引导选项的数据链传递支持
 *
 * 依赖关系：
 *  useSettings → usePageContent → useChat(tabId) → usePendingTask → useTabManager
 *
 * 注意：currentTabId 状态保留在此组件，打破 useChat 与 useTabManager 之间的循环依赖。
 *  - useTabManager 通过 onSetTabId 回调更新 currentTabId
 *  - useChat 直接消费 currentTabId
 **/

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSettings } from '@/hooks/useSettings';
import { usePageContent } from '@/hooks/usePageContent';
import { useChat } from '@/hooks/useChat';
import { useTabManager } from '@/hooks/useTabManager';
import { usePendingTask } from '@/hooks/usePendingTask';
import { QuickQuestion } from '@/types';
import { cn } from '@/lib/utils';
import {
  Settings,
  Loader2,
  AlertCircle,
  RefreshCw,
  Brain,
  Trash2,
  ExternalLink,
  LayoutPanelTop,
  AppWindow,
  PanelRight,
  X,
} from 'lucide-react';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Tooltip } from '@/components/ui/tooltip';
import { MessageList } from '@/components/MessageList';
import { InputArea } from '@/components/InputArea';
import { ScrollArea } from '@/components/ui/scroll-area';

type View = 'main' | 'settings';

interface AppProps {
  /** 窗口模式下要绑定的目标标签页 ID */
  initialTargetTabId?: number | null;
  /** 当前容器模式（sidepanel/window/overlay） */
  surfaceMode?: 'sidepanel' | 'window' | 'overlay';
}

/**
 * 主应用组件
 *
 * 仅负责：
 *  1. 组合各 Hook 和组件
 *  2. 头部 UI（思考模式、清空、设置按钮）
 *  3. 配置提示横幅
 *  4. 页面信息卡片
 */
export const App: React.FC<AppProps> = ({
  initialTargetTabId = null,
  surfaceMode = 'sidepanel',
}) => {
  const [view, setView] = useState<View>('main');
  const [input, setInput] = useState('');
  // currentTabId 由 useTabManager 写入，由 useChat 读取
  const [currentTabId, setCurrentTabId] = useState<number | null>(initialTargetTabId);
  // 当前 tab 的 URL，用于按页面存储对话记录（跨刷新/模式切换恢复）
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  // 待提问的选中文本（来自右键"在侧边栏提问"）
  const [pendingAskText, setPendingAskText] = useState<string | null>(null);
  // 切换显示方式下拉菜单
  const [showModeMenu, setShowModeMenu] = useState(false);
  // ⌘K 行动菜单状态
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement>(null);

  // 监听全局 ⌘K 快捷键和 ESC 键
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandMenu(prev => !prev);
      }
      if (e.key === 'Escape') {
        setShowCommandMenu(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── 设置 ──────────────────────────────────────────────────────────────────
  const {
    settings,
    loading: settingsLoading,
    updateProviderConfig,
    getProviderConfig,
    updateEnableReasoning,
    updateEnableSuggestedQuestions,
    updateAssistantDisplayMode,
    updateFloatButtonClickAction,
    updateTranslateShortcut,
    updateQuickQuestions,
    isConfigValid,
  } = useSettings();

  // ── 页面内容 ──────────────────────────────────────────────────────────────
  const {
    pageContent,
    loading: pageLoading,
    error: pageError,
    fetchPageContent,
    clearPageContent,
  } = usePageContent(initialTargetTabId);

  // ── 聊天（依赖 currentTabId，每次切换 tab 自动恢复对应对话） ──────────────
  const {
    messages,
    isLoading: chatLoading,
    error: chatError,
    streamingContent,
    suggestedQuestions,
    sendMessage,
    summarizePage,
    clearMessages,
    savedMessages,
    restoreMessages,
    dismissSavedMessages,
  } = useChat(settings.providerConfig, settings.enableReasoning, currentTabId, currentUrl, settings.enableSuggestedQuestions);

  // ── 任务调度（排他锁 + 延迟执行 + 消息监听） ─────────────────────────────
  const { resetPendingState } = usePendingTask({
    chatLoading,
    isConfigValid,
    pageContent,
    pageLoading,
    settingsLoading,
    sendMessage,
    summarizePage,
    setPendingAskText,
    textareaRef,
    targetTabId: surfaceMode === 'overlay' || surfaceMode === 'window' ? initialTargetTabId : null,
    hasSavedMessages: savedMessages.length > 0,
  });

  // ── 标签页生命周期（监听激活/URL 变化，通知 background） ─────────────────
  useTabManager({
    currentTabId,
    onSetTabId: setCurrentTabId,
    fixedTabId: surfaceMode === 'window' || surfaceMode === 'overlay' ? initialTargetTabId : null,
    onTabSwitch: useCallback(() => {
      // tab 切换：清空页面内容 + 重置任务状态 + 重新抓取
      clearPageContent();
      resetPendingState();
      fetchPageContent();
    }, [clearPageContent, resetPendingState, fetchPageContent]),
    onUrlChange: useCallback(() => {
      // URL 变化：先清空对话 + 页面内容 + 任务状态，再读取新 URL 并重新抓取
      clearMessages();
      clearPageContent();
      resetPendingState();
      if (currentTabId !== null) {
        chrome.tabs.get(currentTabId, (tab) => {
          if (chrome.runtime.lastError || !tab?.url) return;
          setCurrentUrl(tab.url);
        });
      }
      fetchPageContent();
    }, [clearMessages, clearPageContent, resetPendingState, fetchPageContent, currentTabId]),
  });

  // currentTabId 变化时获取对应 tab 的 URL
  useEffect(() => {
    console.log('[App] currentTabId 变化:', currentTabId);
    if (currentTabId === null) return;
    chrome.tabs.get(currentTabId, (tab) => {
      if (chrome.runtime.lastError || !tab?.url) {
        console.log('[App] chrome.tabs.get 失败:', chrome.runtime.lastError);
        return;
      }
      console.log('[App] 获取到 URL:', tab.url);
      setCurrentUrl(tab.url);
    });
  }, [currentTabId]);

  // 设置加载完成后获取初始页面内容
  useEffect(() => {
    if (!settingsLoading) {
      fetchPageContent(currentTabId);
    }
  }, [settingsLoading, fetchPageContent, currentTabId]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, suggestedQuestions]);

  // 自动调整文本框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // 监听来自 overlay 外壳的消息（overlay 模式下按钮在外壳中）
  useEffect(() => {
    if (surfaceMode !== 'overlay') return;

    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'object' || !event.data.type) return;

      switch (event.data.type) {
        case 'OVERLAY_TOGGLE_REASONING':
          updateEnableReasoning(!settings.enableReasoning);
          break;
        case 'OVERLAY_CLEAR_MESSAGES':
          clearMessages();
          break;
        case 'OVERLAY_OPEN_SETTINGS':
          setView('settings');
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [surfaceMode, settings.enableReasoning, updateEnableReasoning, clearMessages]);

  // ── 事件处理 ──────────────────────────────────────────────────────────────

  // 切换显示方式（不关闭对话记录，通知 background 以新方式重新打开）
  const handleSwitchMode = useCallback((mode: string) => {
    setShowModeMenu(false);
    // sidepanel/window 模式下 currentTabId 已知，直接用；避免 tabs.query 异步丢失用户手势上下文
    const tabId = currentTabId;
    if (!tabId) return;
    chrome.runtime.sendMessage({ type: 'SWITCH_DISPLAY_MODE', mode, tabId });
  }, [currentTabId]);

  // 点击其他区域关闭模式菜单
  useEffect(() => {
    if (!showModeMenu) return;
    const handler = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setShowModeMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModeMenu]);

  // 发送消息（自动拼接 pendingAskText）
  const handleSendMessage = useCallback((content: string) => {
    if (!content.trim() || chatLoading) return;
    dismissSavedMessages(); // 自动忽略历史会话
    let finalPrompt = content;
    if (pendingAskText) {
      finalPrompt = `${content}\n\n${pendingAskText}`;
      setPendingAskText(null);
    }
    sendMessage(finalPrompt, pageContent?.content);
    setInput('');
  }, [sendMessage, pageContent, chatLoading, pendingAskText, dismissSavedMessages]);

  // 触发页面总结
  const handleSummarize = useCallback(async () => {
    if (!pageContent?.content || chatLoading) return;
    dismissSavedMessages(); // 自动忽略历史会话
    await summarizePage(pageContent.content);
  }, [pageContent, chatLoading, summarizePage, dismissSavedMessages]);

  // 处理常用问题点击（将 {{text}} 替换为选中文本后发送）
  const handleQuickQuestion = useCallback((question: QuickQuestion) => {
    if (!pendingAskText || chatLoading) return;
    const prompt = question.prompt.replace('{{text}}', pendingAskText);
    sendMessage(prompt, pageContent?.content);
    setPendingAskText(null);
    setInput('');
  }, [pendingAskText, chatLoading, sendMessage, pageContent]);

  const configValid = isConfigValid();

  // ── 设置页视图 ────────────────────────────────────────────────────────────
  if (view === 'settings') {
    return (
      <SettingsPanel
        config={settings.providerConfig}
        onSave={updateProviderConfig}
        onBack={() => setView('main')}
        getProviderConfig={getProviderConfig}
        translateShortcut={settings.translateShortcut}
        onUpdateTranslateShortcut={updateTranslateShortcut}
        quickQuestions={settings.quickQuestions}
        onUpdateQuickQuestions={updateQuickQuestions}
        assistantDisplayMode={settings.assistantDisplayMode || 'sidepanel'}
        onUpdateAssistantDisplayMode={updateAssistantDisplayMode}
        floatButtonClickAction={settings.floatButtonClickAction || 'open'}
        onUpdateFloatButtonClickAction={updateFloatButtonClickAction}
        enableSuggestedQuestions={settings.enableSuggestedQuestions}
        onUpdateEnableSuggestedQuestions={updateEnableSuggestedQuestions}
      />
    );
  }

  // ── 主视图 ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background">
      {/* 头部：overlay 模式下隐藏（功能按钮已在外壳中） */}
      {surfaceMode !== 'overlay' && (
        <div className="flex items-center justify-between p-3 border-b">
          <h1 className="text-base font-semibold">Samo 助手</h1>
          <div className="flex items-center gap-1">
            {/* 思考模式开关 */}
            <Tooltip
              content={
                <div className="max-w-[200px]">
                  <div className="font-medium mb-1">
                    {settings.enableReasoning ? '🧠 思考模式：开启' : '🧠 思考模式：关闭'}
                  </div>
                  <div className="text-muted-foreground">
                    {settings.enableReasoning
                      ? '使用 deepseek-v4-pro 时会显示思考过程'
                      : '点击开启，查看 AI 的思考过程'}
                  </div>
                </div>
              }
            >
              <Button
                variant={settings.enableReasoning ? 'default' : 'ghost'}
                size="icon"
                onClick={() => updateEnableReasoning(!settings.enableReasoning)}
                className={cn(
                  'h-8 w-8',
                  settings.enableReasoning && 'bg-primary text-primary-foreground'
                )}
              >
                <Brain className="h-4 w-4" />
              </Button>
            </Tooltip>

            {pageContent && configValid && (
              <Tooltip content="重新总结页面">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSummarize}
                  disabled={chatLoading}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  {chatLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </Tooltip>
            )}

            {messages.length > 0 && (
              <Tooltip content="清空对话">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearMessages}
                  className="h-8 w-8"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Tooltip>
            )}

            <Tooltip content="设置 API 密钥和模型">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setView('settings')}
                className="h-8 w-8"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </Tooltip>

            {/* 切换显示方式 */}
            <div className="relative" ref={modeMenuRef}>
              <Tooltip content="切换显示方式">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowModeMenu(v => !v)}
                  className="h-8 w-8"
                >
                  <LayoutPanelTop className="h-4 w-4" />
                </Button>
              </Tooltip>
              {showModeMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border bg-popover shadow-md py-1 text-sm">
                  {([
                    { value: 'overlay', label: '页面内浮窗', Icon: AppWindow },
                    { value: 'window', label: '独立窗口', Icon: ExternalLink },
                    { value: 'sidepanel', label: '浏览器侧边栏', Icon: PanelRight },
                  ] as const).map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      onClick={() => handleSwitchMode(value)}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-2 hover:bg-accent transition-colors text-left',
                        surfaceMode === value && 'text-primary font-medium'
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {label}
                      {surfaceMode === value && (
                        <span className="ml-auto text-xs text-muted-foreground">当前</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 配置提示横幅 */}
      {!configValid && (
        <div className="flex items-center gap-2 p-3 mx-3 mt-3 rounded-lg bg-muted text-sm">
          <AlertCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground flex-1">请先配置 API 密钥</span>
          <Button
            variant="link"
            size="sm"
            className="p-0 h-auto"
            onClick={() => setView('settings')}
          >
            前往设置
          </Button>
        </div>
      )}

      {/* 页面信息卡片 */}
      <div className="p-3 border-b">
        <Card className="bg-muted/30 border-muted/50 shadow-none rounded-xl">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                {pageContent ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-primary/80 bg-primary/10 border border-primary/20 font-medium px-1.5 py-0.5 rounded flex-shrink-0">
                        {new URL(pageContent.url).hostname}
                      </span>
                      <h3 className="font-semibold text-xs line-clamp-1 text-foreground/90">
                        {pageContent.title || '无标题'}
                      </h3>
                    </div>
                    {(() => {
                      const wordCount = pageContent.content?.length || 0;
                      const readTime = Math.ceil(wordCount / 400);
                      const savedTime = Math.max(1, Math.round(readTime * 0.8));
                      return (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                          <span>✓ 已分析 {wordCount} 字</span>
                          <span>•</span>
                          <span>⏳ 预计读 {readTime} 分钟</span>
                          <span>•</span>
                          <span>⚡ AI 节省 {savedTime} 分钟</span>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-1">
                    {pageLoading ? '正在读取并分析当前网页...' : '暂时无法读取网页正文内容'}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fetchPageContent(currentTabId)}
                disabled={pageLoading}
                className="h-7 w-7 flex-shrink-0 hover:bg-muted active:bg-muted/80 rounded-md"
                title="重新提取页面"
              >
                {pageLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 消息列表 */}
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        chatLoading={chatLoading}
        chatError={chatError}
        pageError={pageError}
        hasPageContent={!!pageContent?.content}
        configValid={configValid}
        onSummarize={handleSummarize}
        messagesEndRef={messagesEndRef}
        suggestedQuestions={suggestedQuestions}
        onSelectQuestion={handleSendMessage}
        hasSavedMessages={savedMessages.length > 0}
        onRestoreMessages={restoreMessages}
      />

      {/* 输入区域 */}
      <InputArea
        input={input}
        setInput={setInput}
        chatLoading={chatLoading}
        configValid={configValid}
        pendingAskText={pendingAskText}
        onClearPendingAskText={() => setPendingAskText(null)}
        quickQuestions={settings.quickQuestions || []}
        onQuickQuestion={handleQuickQuestion}
        onSend={handleSendMessage}
        onOpenCommandMenu={() => setShowCommandMenu(prev => !prev)}
        textareaRef={textareaRef}
      />

      {/* ⌘K 行动指令面板 */}
      {showCommandMenu && (
        <div className="absolute inset-0 z-50 bg-background/50 backdrop-blur-[2px] flex flex-col justify-end transition-all duration-300">
          {/* 点击背景关闭 */}
          <div className="absolute inset-0" onClick={() => setShowCommandMenu(false)} />
          <div className="relative w-full bg-popover border-t rounded-t-2xl shadow-xl flex flex-col max-h-[75%] animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5 text-primary" />
                Samo 行动面板
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowCommandMenu(false)}
                className="h-7 w-7 rounded-full hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-1">
                {([
                  { 
                    id: 'summarize', 
                    label: '一键总结当前页面', 
                    desc: '快速提炼当前网页的核心主旨与大纲', 
                    disabled: !pageContent?.content || chatLoading,
                    action: () => { handleSummarize(); setShowCommandMenu(false); } 
                  },
                  { id: 'mindmap', label: '生成思维导图 (未来支持)', desc: '基于网页结构生成可视化的思维导图', disabled: true },
                  { id: 'rewrite', label: 'AI Rewrite 改写 (未来支持)', desc: '改写、润色当前选中的网页文字', disabled: true },
                  { id: 'translate', label: '网页全文翻译 (未来支持)', desc: '将当前网页翻译为其他目标语言', disabled: true },
                  { id: 'export', label: '导出为 Markdown (未来支持)', desc: '将对话记录与总结导出到本地', disabled: true }
                ]).map((cmd) => (
                  <button
                    key={cmd.id}
                    onClick={cmd.action}
                    disabled={cmd.disabled}
                    className={cn(
                      "flex flex-col items-start w-full px-3 py-2 text-left rounded-lg transition-colors",
                      cmd.disabled 
                        ? "opacity-40 cursor-not-allowed" 
                        : "hover:bg-accent active:bg-accent/80 text-foreground"
                    )}
                  >
                    <span className="text-sm font-medium">{cmd.label}</span>
                    <span className="text-[11px] text-muted-foreground mt-0.5">{cmd.desc}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
            <div className="p-3 border-t bg-muted/20 text-[10px] text-muted-foreground flex justify-between items-center">
              <span>按 Esc 或点击外部关闭</span>
              <span className="font-mono bg-muted border px-1.5 py-0.5 rounded text-[9px]">ESC</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
