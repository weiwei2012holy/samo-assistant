/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 侧边栏主应用组件 - 整合总结和对话功能
 **/

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { useSettings } from '@/hooks/useSettings';
import { usePageContent } from '@/hooks/usePageContent';
import { useChat } from '@/hooks/useChat';
import { ChatMessage } from '@/types';
import { cn } from '@/lib/utils';
import {
  Settings,
  Send,
  Loader2,
  User,
  Bot,
  AlertCircle,
  Globe,
  RefreshCw,
  Sparkles,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Markdown } from '@/components/Markdown';

type View = 'main' | 'settings';

/**
 * 主应用组件
 */
export const App: React.FC = () => {
  // 视图状态
  const [view, setView] = useState<View>('main');
  const [input, setInput] = useState('');
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [pendingTaskChecked, setPendingTaskChecked] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 设置相关
  const {
    settings,
    loading: settingsLoading,
    updateProviderConfig,
    isConfigValid,
  } = useSettings();

  // 页面内容相关
  const {
    pageContent,
    loading: pageLoading,
    error: pageError,
    fetchPageContent,
    clearPageContent,
  } = usePageContent();

  // 聊天相关
  const {
    messages,
    isLoading: chatLoading,
    error: chatError,
    streamingContent,
    sendMessage,
    summarizePage,
    clearMessages,
  } = useChat(settings.providerConfig);

  // 监听来自 background 的任务执行消息
  useEffect(() => {
    const handleMessage = (message: { type: string; task?: { type: string; prompt: string } }) => {
      if (message.type === 'EXECUTE_TASK' && message.task) {
        console.log('收到任务执行消息:', message.task.type);

        // 检查配置是否有效
        if (!isConfigValid()) {
          console.warn('API 配置无效，无法执行任务');
          return;
        }

        // 延迟执行，等待页面内容加载
        setTimeout(() => {
          if (message.task!.type === 'summarize_page') {
            if (pageContent?.content) {
              summarizePage(pageContent.content);
            }
          } else {
            sendMessage(message.task!.prompt, pageContent?.content);
          }
        }, 100);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [isConfigValid, pageContent, sendMessage, summarizePage]);

  // 监听标签页切换
  useEffect(() => {
    // 获取当前标签页
    const getCurrentTab = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        setCurrentTabId(tab.id);
      }
    };

    getCurrentTab();

    // 监听标签页激活事件
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      // 标签页切换时，清空对话和页面内容，重新获取
      if (activeInfo.tabId !== currentTabId) {
        setCurrentTabId(activeInfo.tabId);
        clearMessages();
        clearPageContent();
        setPendingTaskChecked(false); // 重置任务检查状态
        fetchPageContent();
      }
    };

    // 监听标签页更新事件（URL 变化）
    const handleTabUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) => {
      // 当前标签页 URL 变化时，清空对话并重新获取页面内容
      if (tabId === currentTabId && changeInfo.status === 'complete') {
        clearMessages();
        clearPageContent();
        setPendingTaskChecked(false); // 重置任务检查状态
        fetchPageContent();
      }
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
    };
  }, [currentTabId, clearMessages, clearPageContent, fetchPageContent]);

  // 初始化时获取页面内容
  useEffect(() => {
    if (!settingsLoading) {
      fetchPageContent();
    }
  }, [settingsLoading, fetchPageContent]);

  // 检查并处理待处理任务（来自右键菜单或浮窗）
  useEffect(() => {
    // 只在页面内容加载完成且未检查过任务时执行
    if (pendingTaskChecked || settingsLoading || pageLoading || !pageContent) {
      return;
    }

    const checkPendingTask = async () => {
      try {
        const task = await chrome.runtime.sendMessage({ type: 'GET_PENDING_TASK' });
        setPendingTaskChecked(true); // 标记已检查

        if (!task || !task.prompt) {
          return;
        }

        // 检查配置是否有效
        if (!isConfigValid()) {
          console.warn('API 配置无效，无法执行任务');
          return;
        }

        console.log('执行待处理任务:', task.type);

        if (task.type === 'summarize_page') {
          // 总结页面
          summarizePage(pageContent.content);
        } else {
          // 翻译、解释、总结选中内容、提问
          sendMessage(task.prompt, pageContent.content);
        }
      } catch (error) {
        console.error('获取待处理任务失败:', error);
        setPendingTaskChecked(true);
      }
    };

    checkPendingTask();
  }, [pendingTaskChecked, settingsLoading, pageLoading, pageContent, isConfigValid, sendMessage, summarizePage]);

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

  // 处理发送消息
  const handleSendMessage = useCallback((content: string) => {
    if (!content.trim() || chatLoading) return;
    sendMessage(content, pageContent?.content);
    setInput('');
  }, [sendMessage, pageContent, chatLoading]);

  // 处理生成总结
  const handleSummarize = useCallback(async () => {
    if (!pageContent?.content || chatLoading) return;
    await summarizePage(pageContent.content);
  }, [pageContent, chatLoading, summarizePage]);

  // 处理表单提交
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(input);
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // 检查配置是否有效
  const configValid = isConfigValid();

  // 设置页面视图
  if (view === 'settings') {
    return (
      <SettingsPanel
        config={settings.providerConfig}
        onSave={updateProviderConfig}
        onBack={() => setView('main')}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 头部 */}
      <div className="flex items-center justify-between p-3 border-b">
        <h1 className="text-base font-semibold">AI 助手</h1>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearMessages}
              title="清空对话"
              className="h-8 w-8"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setView('settings')}
            title="设置"
            className="h-8 w-8"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 配置提示 */}
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
                onClick={fetchPageContent}
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
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
          {/* 空状态 */}
          {messages.length === 0 && !chatLoading && (
            <div className="text-center py-8">
              <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground mb-4">
                AI 可以帮你总结页面或回答问题
              </p>
              {pageContent && configValid && (
                <Button
                  onClick={handleSummarize}
                  disabled={chatLoading}
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  一键总结页面
                </Button>
              )}
            </div>
          )}

          {/* 消息列表 */}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {/* 流式响应显示 - 使用纯文本避免闪烁 */}
          {streamingContent && (
            <StreamingBubble content={streamingContent} />
          )}

          {/* 加载指示器 */}
          {chatLoading && !streamingContent && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>思考中...</span>
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {(chatError || pageError) && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{chatError || pageError}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* 输入区域 */}
      <div className="p-3 border-t">
        {/* 快捷操作 */}
        {messages.length > 0 && pageContent && configValid && (
          <div className="flex gap-2 mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSummarize}
              disabled={chatLoading}
              className="text-xs h-7 gap-1"
            >
              <Sparkles className="h-3 w-3" />
              重新总结
            </Button>
          </div>
        )}

        {/* 输入框 */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={configValid ? "输入消息，或点击上方总结页面..." : "请先配置 API 密钥"}
            className="min-h-[40px] max-h-[120px] resize-none text-sm"
            rows={1}
            disabled={chatLoading || !configValid}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || chatLoading || !configValid}
            className="flex-shrink-0 h-10 w-10"
          >
            {chatLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

interface MessageBubbleProps {
  message: ChatMessage;
}

/**
 * 消息气泡组件 - 使用 memo 优化避免不必要的重渲染
 */
const MessageBubble = memo<MessageBubbleProps>(({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-2', isUser && 'flex-row-reverse')}>
      {/* 头像 */}
      <div
        className={cn(
          'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* 消息内容 */}
      <div
        className={cn(
          'flex-1 rounded-lg px-3 py-2 text-sm max-w-[85%]',
          isUser ? 'bg-primary text-primary-foreground ml-8' : 'bg-muted mr-8'
        )}
      >
        {isUser ? (
          // 用户消息保持纯文本
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          // AI 消息使用 Markdown 渲染
          <div className="break-words">
            <Markdown content={message.content} />
          </div>
        )}
      </div>
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';

interface StreamingBubbleProps {
  content: string;
}

/**
 * 流式输出气泡组件 - 使用纯文本渲染避免闪烁
 */
const StreamingBubble: React.FC<StreamingBubbleProps> = ({ content }) => {
  return (
    <div className="flex gap-2">
      {/* 头像 */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
        <Bot className="h-4 w-4" />
      </div>

      {/* 消息内容 - 流式输出时使用纯文本 */}
      <div className="flex-1 rounded-lg px-3 py-2 text-sm max-w-[85%] bg-muted mr-8">
        <div className="whitespace-pre-wrap break-words">
          {content}
          <span className="inline-block w-1.5 h-4 ml-0.5 bg-foreground/70 animate-pulse" />
        </div>
      </div>
    </div>
  );
};
