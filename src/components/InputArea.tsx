/**
 * @Author wei
 * @Date 2026-02-24
 * @Description 输入区域组件 - 消息输入框、常用问题卡片和快捷操作
 *
 * 布局（从上到下）：
 *  1. 常用问题快捷卡片（仅当 pendingAskText 存在时显示）
 *  2. 重新总结按钮（有消息且有页面内容时显示）
 *  3. 消息输入框 + 发送按钮
 **/

import React, { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { QuickQuestion } from '@/types';
import { Send, Loader2, Sparkles, X } from 'lucide-react';

interface InputAreaProps {
  /** 输入框内容 */
  input: string;
  /** 更新输入框内容 */
  setInput: (val: string) => void;
  /** 是否正在等待 AI 响应 */
  chatLoading: boolean;
  /** API 配置是否有效 */
  configValid: boolean;
  /** 待提问的选中文本（来自右键"在侧边栏提问"） */
  pendingAskText: string | null;
  /** 清除待提问文本 */
  onClearPendingAskText: () => void;
  /** 常用问题列表 */
  quickQuestions: QuickQuestion[];
  /** 点击常用问题时触发 */
  onQuickQuestion: (q: QuickQuestion) => void;
  /** 发送消息（含自动拼接 pendingAskText 的逻辑） */
  onSend: (content: string) => void;
  /** 重新总结页面 */
  onSummarize: () => void;
  /** 是否有对话消息（影响"重新总结"按钮显示） */
  hasMessages: boolean;
  /** 是否有页面内容（影响"重新总结"按钮显示） */
  hasPageContent: boolean;
  /** textarea ref，用于 ask 任务时自动聚焦 */
  textareaRef: RefObject<HTMLTextAreaElement>;
}

/**
 * 输入区域组件
 *
 * - 常用问题卡片：显示选中文本预览和快捷问题按钮
 * - 重新总结按钮：对话进行中可快速重新总结页面
 * - 输入框：Enter 发送，Shift+Enter 换行，自动高度调整由 App.tsx 的 useEffect 处理
 */
export const InputArea: React.FC<InputAreaProps> = ({
  input,
  setInput,
  chatLoading,
  configValid,
  pendingAskText,
  onClearPendingAskText,
  quickQuestions,
  onQuickQuestion,
  onSend,
  onSummarize,
  hasMessages,
  hasPageContent,
  textareaRef,
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend(input);
    }
  };

  return (
    <div className="p-3 border-t">
      {/* 常用问题快捷卡片（当有待提问文本时显示） */}
      {pendingAskText && configValid && (
        <Card className="mb-3 bg-primary/5 border-primary/20">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">选中的文本</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onClearPendingAskText}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            {/* 选中文本预览（最多 2 行） */}
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
              {pendingAskText}
            </p>
            {/* 常用问题快捷按钮 */}
            <div className="flex flex-wrap gap-2">
              {quickQuestions.map((q) => (
                <Button
                  key={q.id}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => onQuickQuestion(q)}
                  disabled={chatLoading}
                >
                  {q.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              💡 点击常用问题或在下方输入自定义问题
            </p>
          </CardContent>
        </Card>
      )}

      {/* 重新总结快捷按钮（有消息且有页面内容时显示） */}
      {hasMessages && hasPageContent && configValid && (
        <div className="flex gap-2 mb-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onSummarize}
            disabled={chatLoading}
            className="text-xs h-7 gap-1"
          >
            <Sparkles className="h-3 w-3" />
            重新总结
          </Button>
        </div>
      )}

      {/* 输入框 + 发送按钮 */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={configValid ? '输入消息，或点击上方总结页面...' : '请先配置 API 密钥'}
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
  );
};
