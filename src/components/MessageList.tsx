/**
 * @Author wei
 * @Date 2026-02-24
 * @Description 消息列表组件 - 展示对话消息、流式输出和加载状态
 *
 * 包含三个子组件：
 *  - MessageList：滚动容器，汇总所有消息相关 UI
 *  - MessageBubble：单条消息气泡（用户 / AI），使用 memo 优化渲染
 *  - StreamingBubble：AI 流式输出气泡，带闪烁光标
 **/

import React, { memo, RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from '@/types';
import { cn } from '@/lib/utils';
import { Bot, User, Loader2, AlertCircle, Sparkles } from 'lucide-react';
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
 * - AI 消息：左对齐，灰色背景，Markdown 渲染
 * - 使用 memo 优化，只有 message 引用变化时才重渲染
 */
export const MessageBubble = memo<MessageBubbleProps>(({ message }) => {
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
          // 用户消息保持纯文本，避免 Markdown 误渲染
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
 * 流式输出气泡组件
 *
 * 与 MessageBubble（AI 端）布局一致，额外在末尾显示闪烁光标，
 * 给用户实时输出的视觉反馈。
 */
export const StreamingBubble: React.FC<StreamingBubbleProps> = ({ content }) => {
  return (
    <div className="flex gap-2">
      {/* 头像 */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
        <Bot className="h-4 w-4" />
      </div>

      {/* 消息内容 - 使用 Markdown 渲染 */}
      <div className="flex-1 rounded-lg px-3 py-2 text-sm max-w-[85%] bg-muted mr-8">
        <div className="break-words">
          <Markdown content={content} />
          {/* 闪烁光标 */}
          <span className="inline-block w-1.5 h-4 ml-0.5 bg-foreground/70 animate-pulse align-middle" />
        </div>
      </div>
    </div>
  );
};
