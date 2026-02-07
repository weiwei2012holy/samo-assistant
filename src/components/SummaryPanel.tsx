/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 页面总结组件，用于显示和生成页面内容总结
 **/

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PageContent } from '@/types';
import { FileText, RefreshCw, Loader2, AlertCircle, Globe, ExternalLink } from 'lucide-react';

interface SummaryPanelProps {
  /** 页面内容 */
  pageContent: PageContent | null;
  /** 总结内容 */
  summary: string;
  /** 是否正在加载页面 */
  isLoadingPage: boolean;
  /** 是否正在生成总结 */
  isLoadingSummary: boolean;
  /** 错误信息 */
  error: string | null;
  /** 获取页面内容回调 */
  onFetchPage: () => void;
  /** 生成总结回调 */
  onSummarize: () => void;
}

/**
 * 页面总结面板组件
 */
export const SummaryPanel: React.FC<SummaryPanelProps> = ({
  pageContent,
  summary,
  isLoadingPage,
  isLoadingSummary,
  error,
  onFetchPage,
  onSummarize,
}) => {
  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* 页面信息卡片 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">当前页面</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onFetchPage}
                  disabled={isLoadingPage}
                >
                  {isLoadingPage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {pageContent ? (
                <div className="space-y-2">
                  <h3 className="font-medium text-sm line-clamp-2">
                    {pageContent.title || '无标题'}
                  </h3>
                  <a
                    href={pageContent.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 truncate"
                  >
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{pageContent.url}</span>
                  </a>
                  {pageContent.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-2">
                      {pageContent.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    内容长度: {pageContent.content.length.toLocaleString()} 字符
                  </p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    {isLoadingPage ? '正在获取页面...' : '点击刷新按钮获取页面内容'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 生成总结按钮 */}
          {pageContent && !summary && (
            <Button
              className="w-full"
              onClick={onSummarize}
              disabled={isLoadingSummary}
            >
              {isLoadingSummary ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  正在生成总结...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  生成页面总结
                </>
              )}
            </Button>
          )}

          {/* 总结内容 */}
          {summary && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">页面总结</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onSummarize}
                    disabled={isLoadingSummary}
                  >
                    {isLoadingSummary ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <CardDescription>AI 为您生成的内容摘要</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="markdown-content text-sm whitespace-pre-wrap">
                  {summary}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 流式响应显示 */}
          {isLoadingSummary && !summary && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">正在生成总结</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">AI 正在分析页面内容...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
