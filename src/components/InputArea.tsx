/**
 * @Author wei
 * @Date 2026-07-16
 * @Description 输入区域组件 - 支持 / 唤起的 Raycast 式指令面板、常用问题卡片和一体化输入框
 **/

import React, { RefObject, useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { QuickQuestion, CustomSlashCommand } from '@/types';
import { getTargetLanguageName } from '@/services/storage';
import { Send, Loader2, X, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  /** 是否有页面内容 */
  hasPageContent: boolean;
  /** 用户自定义的斜杠 / 指令列表 */
  customSlashCommands?: CustomSlashCommand[];
  /** 默认翻译目标语言 */
  defaultTranslateLanguage?: string;
  /** textarea ref，用于 ask 任务时自动聚焦 */
  textareaRef: RefObject<HTMLTextAreaElement>;
}

/**
 * 输入区域组件
 *
 * - 支持输入 / 实时唤出指令面板。可通过 ↑↓ 选择、Enter 键执行、Esc 关闭面板。
 * - 实时拼音首字母/Alias检索（例如 zj -> 总结）。
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
  hasPageContent,
  customSlashCommands = [],
  defaultTranslateLanguage = 'system',
  textareaRef,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 定义所有可用的 AI 命令
  const COMMANDS = useMemo(() => {
    const systemCmds = [
      {
        id: 'summary',
        icon: '📝',
        label: '总结当前网页',
        alias: ['zj', 'zongjie', 'summary', '总结', 'zjym'],
        disabled: !hasPageContent,
        action: () => onSummarize()
      },
      {
        id: 'keypoints',
        icon: '📌',
        label: '提炼核心观点',
        alias: ['ld', 'tl', 'keypoints', 'core', '核心', '重点', '提炼'],
        disabled: !hasPageContent,
        action: () => onSend('请以极简的结构化要点，提炼当前网页的核心观点和关键事实。')
      },
      {
        id: 'explain',
        icon: '💡',
        label: '给小白解释',
        alias: ['xb', 'explain', 'simplfy', '小白', '解释'],
        disabled: !hasPageContent,
        action: () => onSend('请用极其通俗易懂、连小学生都能听懂的语言，解释这篇文章的核心内容。')
      },
      {
        id: 'ask',
        icon: '❓',
        label: '基于当前网页提问',
        alias: ['tw', 'ask', 'question', '提问', '基于', 'jw'],
        disabled: !hasPageContent,
        action: () => {} // 特殊逻辑
      }
    ];

    const userCmds = customSlashCommands.map(cmd => {
      let prompt = cmd.prompt;
      if (cmd.id === 'translation' && prompt.includes('翻译为中文')) {
        const targetLangName = getTargetLanguageName(defaultTranslateLanguage);
        prompt = prompt.replace('翻译为中文', `翻译为${targetLangName}`);
      }
      return {
        id: cmd.id,
        icon: '⚙️',
        label: cmd.label,
        alias: [cmd.id, cmd.label],
        disabled: !hasPageContent,
        action: () => onSend(prompt)
      };
    });

    return [...systemCmds, ...userCmds];
  }, [onSummarize, onSend, hasPageContent, customSlashCommands, defaultTranslateLanguage]);

  // 判断是否应该显示指令面板
  const showPalette = useMemo(() => {
    return configValid && input.startsWith('/') && !input.startsWith('/ask ');
  }, [configValid, input]);

  // 计算搜索词
  const searchTerm = useMemo(() => {
    return showPalette ? input.slice(1).toLowerCase().trim() : '';
  }, [showPalette, input]);

  // 根据搜索词过滤可用的指令列表
  const filteredCommands = useMemo(() => {
    return COMMANDS.filter(cmd => {
      if (cmd.disabled) return false;
      if (!searchTerm) return true;
      return (
        cmd.label.toLowerCase().includes(searchTerm) ||
        cmd.id.toLowerCase().includes(searchTerm) ||
        cmd.alias.some(a => a.toLowerCase().includes(searchTerm))
      );
    });
  }, [COMMANDS, searchTerm]);

  // 当过滤列表变化时，自动重置选中项
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  // 处理点击左侧斜杠按钮的交互（支持鼠标点击唤出指令菜单）
  const handleSlashIconClick = () => {
    if (chatLoading || !configValid) return;
    if (input.startsWith('/')) {
      setInput('');
    } else {
      setInput('/');
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }, 50);
    }
  };

  const handleExecuteCommand = (cmd: typeof COMMANDS[0]) => {
    if (cmd.id === 'ask') {
      setInput('/ask ');
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(5, 5);
        }
      }, 50);
      return;
    }
    setInput('');
    cmd.action();
  };

  const handleSendMessageHelper = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('/ask ')) {
      const actualQuery = trimmed.slice(5).trim();
      if (actualQuery) {
        onSend(actualQuery);
        setInput('');
      }
    } else if (!trimmed.startsWith('/')) {
      onSend(trimmed);
      setInput('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showPalette) {
      if (filteredCommands[selectedIndex]) {
        handleExecuteCommand(filteredCommands[selectedIndex]);
      }
    } else {
      handleSendMessageHelper();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showPalette) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setInput(''); // 清除输入框以闭合面板
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          handleExecuteCommand(filteredCommands[selectedIndex]);
        }
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessageHelper();
    }
  };

  return (
    <div className="relative p-3 border-t bg-background">
      {/* Raycast 式指令面板 */}
      {showPalette && (
        <div className="absolute bottom-full left-3 right-3 mb-2 bg-popover border border-muted/80 rounded-xl shadow-xl z-50 p-1 flex flex-col animate-in slide-in-from-bottom-2 duration-150">
          <div className="px-2.5 py-1.5 text-[9px] font-semibold text-muted-foreground border-b border-muted/30 mb-1 flex items-center gap-1">
            <Brain className="h-3 w-3 text-primary animate-pulse" />
            <span>⌘ Samo 指令面板</span>
          </div>
          <div className="max-h-[220px] overflow-y-auto space-y-0.5">
            {filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => handleExecuteCommand(cmd)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded-lg transition-colors text-xs",
                    isSelected 
                      ? "bg-primary text-primary-foreground font-medium" 
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <div className="flex-1 min-w-0 flex items-center justify-between">
                    <span>{cmd.label}</span>
                    <span className={cn("text-[9px] font-mono", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      /{cmd.id}
                    </span>
                  </div>
                </button>
              );
            })}
            {filteredCommands.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                未找到匹配的命令
              </div>
            )}
          </div>
          <div className="px-2.5 py-1.5 border-t border-muted/30 text-[8px] text-muted-foreground flex justify-between items-center bg-muted/20 rounded-b-lg">
            <span>使用 ↑↓ 切换 • Enter 执行</span>
            <span className="font-mono bg-background border px-1.5 py-0.5 rounded text-[7px]">ESC</span>
          </div>
        </div>
      )}

      {/* 常用问题快捷卡片 */}
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
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
              {pendingAskText}
            </p>
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
          </CardContent>
        </Card>
      )}

      {/* 一体化 Focus Bar */}
      <form
        onSubmit={handleSubmit}
        className="relative flex items-end gap-2 bg-muted/40 border border-input rounded-xl pl-2 pr-2 py-1.5 transition-all duration-200 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20"
      >
        {/* 鼠标点击唤出命令的快捷按钮 */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleSlashIconClick}
          disabled={chatLoading || !configValid}
          className={cn(
            "h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground flex-shrink-0 mb-0.5 hover:bg-muted/80",
            input.startsWith('/') && "text-primary hover:text-primary bg-muted"
          )}
          title="点击唤出命令菜单"
        >
          <span className="font-mono text-sm font-semibold">/</span>
        </Button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={configValid ? '继续询问当前网页，输入 / 查看所有操作...' : '请先配置 API 密钥'}
          className="flex-1 bg-transparent border-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 resize-none outline-none text-sm py-1 min-h-[24px] max-h-[120px]"
          rows={1}
          disabled={chatLoading || !configValid}
        />
        <div className="flex items-center gap-1 flex-shrink-0 h-8">
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
