/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 侧边栏主应用组件 - 负责组装各子模块，业务逻辑下沉至 Hook / 组件
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
  Globe,
  RefreshCw,
  Brain,
  Trash2,
  ExternalLink,
  LayoutPanelTop,
  AppWindow,
  PanelRight,
} from 'lucide-react';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Tooltip } from '@/components/ui/tooltip';
import { MessageList } from '@/components/MessageList';
import { InputArea } from '@/components/InputArea';

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
  const modeMenuRef = useRef<HTMLDivElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── 设置 ──────────────────────────────────────────────────────────────────
  const {
    settings,
    loading: settingsLoading,
    updateProviderConfig,
    getProviderConfig,
    updateEnableReasoning,
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
    sendMessage,
    summarizePage,
    clearMessages,
    savedMessages,
    restoreMessages,
    dismissSavedMessages,
  } = useChat(settings.providerConfig, settings.enableReasoning, currentTabId, currentUrl);

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
  }, [messages, streamingContent]);

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
    let finalPrompt = content;
    if (pendingAskText) {
      finalPrompt = `${content}\n\n${pendingAskText}`;
      setPendingAskText(null);
    }
    sendMessage(finalPrompt, pageContent?.content);
    setInput('');
  }, [sendMessage, pageContent, chatLoading, pendingAskText]);

  // 触发页面总结
  const handleSummarize = useCallback(async () => {
    if (!pageContent?.content || chatLoading) return;
    await summarizePage(pageContent.content);
  }, [pageContent, chatLoading, summarizePage]);

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

      {/* 恢复历史会话横幅：当前无消息但 storage 中有历史记录时显示 */}
      {messages.length === 0 && savedMessages.length > 0 && (
        <div className="flex items-center gap-2 p-3 mx-3 mt-3 rounded-lg bg-muted/60 border text-sm">
          <span className="text-muted-foreground flex-1">
            找到 {savedMessages.length} 条历史消息
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-primary hover:text-primary"
            onClick={restoreMessages}
          >
            加载会话
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={dismissSavedMessages}
          >
            忽略
          </Button>
        </div>
      )}

      {/* 页面信息卡片 */}
      <div className="p-3 border-b">
        <Card className="bg-muted/50">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                {pageContent ? (
                  <>
                    <h3 className="font-medium text-sm line-clamp-1">
                      {pageContent.title || '无标题'}
                    </h3>
                    <a
                      href={pageContent.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5"
                    >
                      <span className="truncate">{new URL(pageContent.url).hostname}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {pageLoading ? '正在获取页面...' : '无法获取页面内容'}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fetchPageContent(currentTabId)}
                disabled={pageLoading}
                className="h-7 w-7 flex-shrink-0"
              >
                {pageLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
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
        onSummarize={handleSummarize}
        hasMessages={messages.length > 0}
        hasPageContent={!!pageContent?.content}
        textareaRef={textareaRef}
      />
    </div>
  );
};
