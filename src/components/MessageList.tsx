/**
 * @Author wei
 * @Date 2026-07-16
 * @Description 消息列表组件 - 展示对话消息、流式输出、加载状态以及猜你想问引导选项
 *
 * 包含三个子组件：
 *  - MessageList：滚动容器，汇总所有消息相关 UI
 *  - MessageBubble：单条消息气泡（用户 / AI），使用 memo 优化渲染
 *  - StreamingBubble：AI 流式输出气泡，带闪烁光标
 **/

import React, { memo, useState, useCallback, RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from '@/types';
import { cn } from '@/lib/utils';
import { Bot, User, Loader2, AlertCircle, Sparkles, Copy, Check } from 'lucide-react';
import { Markdown } from '@/components/Markdown';

interface MessageListProps {
  /** 已完成的消息列表 */
  messages: ChatMessage[];
  /** 当前流式输出内容（AI 回复中） */
  streamingContent: string;
  /** 是否正在等待 AI 响应 */
  chatLoading: boolean;
  /** 聊天错误信息 */
  chatError: string | null;
  /** 页面内容获取错误信息 */
  pageError: string | null;
  /** 是否已获取到页面内容（影响"一键总结"按钮显示） */
  hasPageContent: boolean;
  /** API 配置是否有效 */
  configValid: boolean;
  /** 触发页面总结 */
  onSummarize: () => void;
  /** 自动滚动锚点 ref */
  messagesEndRef: RefObject<HTMLDivElement>;
  /** “猜你想问”引导性问题列表 */
  suggestedQuestions?: string[];
  /** 点击引导性问题回调 */
  onSelectQuestion?: (question: string) => void;
}

/**
 * 消息列表区域
 *
 * 渲染逻辑：
 *  1. 无消息时显示空状态（含"一键总结"快捷按钮）
 *  2. 消息列表（MessageBubble）
 *  3. 流式输出（StreamingBubble）
 *  4. 加载指示器（仅在无流式内容时显示）
 *  5. 错误提示
 */
export const MessageList: React.FC<MessageListProps> = ({
  messages,
  streamingContent,
  chatLoading,
  chatError,
  pageError,
  hasPageContent,
  configValid,
  onSummarize,
  messagesEndRef,
  suggestedQuestions = [],
  onSelectQuestion,
}) => {
  return (
    <ScrollArea className="flex-1 p-3">
      <div className="space-y-4">
        {/* 空状态 */}
        {messages.length === 0 && !chatLoading && (
          <div className="text-center py-8">
            <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground mb-4">
              Samo 可以帮你总结页面或回答问题
            </p>
            {hasPageContent && configValid && (
              <Button
                onClick={onSummarize}
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

        {/* 加载指示器（仅在无流式内容时显示） */}
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

        {/* 猜你想问的引导问题 */}
        {!chatLoading && !streamingContent && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && suggestedQuestions.length > 0 && (
          <div className="flex flex-col gap-2 pl-9 pr-8 mt-2 animate-fade-in">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium mb-1">
              <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
              <span>猜你想问：</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => onSelectQuestion?.(q)}
                  className="text-left px-3 py-1.5 text-xs rounded-full border border-primary/25 bg-primary/5 hover:bg-primary/10 hover:border-primary/45 active:bg-primary/20 text-foreground transition-all duration-150 shadow-sm"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 自动滚动锚点 */}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
};

interface MessageBubbleProps {
  message: ChatMessage;
}

/**
 * 消息气泡组件
 *
 * - 用户消息：右对齐，蓝色背景，纯文本渲染
 * - AI 消息：左对齐，灰色背景，Markdown 渲染 + 悬停复制按钮
 * - 使用 memo 优化，只有 message 引用变化时才重渲染
 */
export const MessageBubble = memo<MessageBubbleProps>(({ message }) => {
  const isUser = message.role === 'user';
  // 复制成功后短暂显示对勾，2 秒后复原
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  return (
    <div className={cn('flex gap-3 group', isUser && 'flex-row-reverse')}>
      {/* 头像 */}
      <div
        className={cn(
          'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted/70 text-muted-foreground'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* 消息内容 */}
      <div
        className={cn(
          'flex-1 text-sm break-words',
          isUser 
            ? 'bg-primary text-primary-foreground rounded-2xl px-3.5 py-2 max-w-[85%] ml-8 shadow-sm' 
            : 'max-w-full mr-8 text-foreground/90 leading-relaxed'
        )}
      >
        {isUser ? (
          // 用户消息保持纯文本，避免 Markdown 误渲染
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          // AI 消息：杂志排版，无背景色 + 底部靠右复制按钮
          <>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <Markdown content={message.content} />
            </div>
            {/* 复制按钮：悬停气泡时显示 */}
            <div className="flex justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md hover:bg-muted active:bg-muted/80"
                onClick={handleCopy}
                title={copied ? '已复制' : '复制'}
              >
                {copied
                  ? <Check className="h-3.5 w-3.5 text-green-500" />
                  : <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                }
              </Button>
            </div>
          </>
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
 * 流式输出气泡组件
 *
 * 与 MessageBubble（AI 端）布局一致，额外在末尾显示闪烁光标，
 * 给用户实时输出的视觉反馈。
 */
export const StreamingBubble: React.FC<StreamingBubbleProps> = ({ content }) => {
  return (
    <div className="flex gap-3">
      {/* 头像 */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted/70 flex items-center justify-center text-muted-foreground">
        <Bot className="h-4 w-4" />
      </div>

      {/* 消息内容 - 使用 Markdown 渲染，无气泡背景 */}
      <div className="flex-1 text-sm max-w-full mr-8 text-foreground/90 leading-relaxed">
        <div className="break-words prose prose-sm dark:prose-invert max-w-none">
          <Markdown content={content} />
          {/* 闪烁光标 */}
          <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary/70 animate-pulse align-middle rounded-sm" />
        </div>
      </div>
    </div>
  );
};
