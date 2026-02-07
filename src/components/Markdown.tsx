/**
 * @Author wei
 * @Date 2026-02-07
 * @Description Markdown 渲染组件，用于渲染 AI 返回的 Markdown 内容
 **/

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownProps {
  /** Markdown 内容 */
  content: string;
  /** 自定义类名 */
  className?: string;
}

/**
 * Markdown 渲染组件
 */
export const Markdown: React.FC<MarkdownProps> = ({ content, className }) => {
  return (
    <ReactMarkdown
      className={cn('markdown-content', className)}
      remarkPlugins={[remarkGfm]}
      components={{
        // 段落
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,

        // 标题
        h1: ({ children }) => (
          <h1 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>
        ),

        // 列表
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
        ),
        li: ({ children }) => <li className="ml-1">{children}</li>,

        // 代码
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code
                className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-xs font-mono"
                {...props}
              >
                {children}
              </code>
            );
          }
          return (
            <code className={cn('font-mono text-xs', className)} {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="bg-black/10 dark:bg-white/10 p-3 rounded-md mb-2 overflow-x-auto text-xs">
            {children}
          </pre>
        ),

        // 引用
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/50 pl-3 italic mb-2">
            {children}
          </blockquote>
        ),

        // 链接
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-80"
          >
            {children}
          </a>
        ),

        // 强调
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,

        // 分割线
        hr: () => <hr className="my-3 border-border" />,

        // 表格
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table className="min-w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted">{children}</thead>
        ),
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr className="border-b border-border">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="px-2 py-1 text-left font-semibold">{children}</th>
        ),
        td: ({ children }) => <td className="px-2 py-1">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
};
