/**
 * @Author wei
 * @Date 2026-07-16
 * @Description 输入区域组件 - 消息输入框、常用问题卡片和一体化 Focus Bar 输入框，支持 ⌘K 指令菜单
 **/

import React, { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { QuickQuestion } from '@/types';
import { Send, Loader2, X } from 'lucide-react';

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
  /** 打开 Command Panel 行动菜单 */
  onOpenCommandMenu?: () => void;
  /** textarea ref，用于 ask 任务时自动聚焦 */
  textareaRef: RefObject<HTMLTextAreaElement>;
}

/**
 * 输入区域组件
 *
 * - 常用问题卡片：显示选中文本预览和快捷问题按钮
 * - 一体化输入卡片：极简无边框设计，右侧集成 ⌘K 行动按钮及发送键
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
  onOpenCommandMenu,
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
    <div className="p-3 border-t bg-background">
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

      {/* 极简无边框一体化输入卡片 */}
      <form
        onSubmit={handleSubmit}
        className="relative flex items-end gap-2 bg-muted/40 border border-input rounded-xl pl-3 pr-2 py-1.5 transition-all duration-200 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={configValid ? '继续询问当前网页...' : '请先配置 API 密钥'}
          className="flex-1 bg-transparent border-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 resize-none outline-none text-sm py-1 min-h-[24px] max-h-[120px]"
          rows={1}
          disabled={chatLoading || !configValid}
        />
        <div className="flex items-center gap-1 flex-shrink-0 h-8">
          {configValid && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onOpenCommandMenu}
              className="h-7 px-1.5 text-[10px] font-mono text-muted-foreground hover:bg-muted active:bg-muted/80 rounded-md border border-muted/60"
              title="打开行动菜单 (⌘K)"
            >
              ⌘K 行动
            </Button>
          )}
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || chatLoading || !configValid}
            className="h-7 w-7 rounded-lg"
          >
            {chatLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};
