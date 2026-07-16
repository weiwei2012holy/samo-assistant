/**
 * @Author wei
 * @Date 2026-07-16
 * @Description 设置面板组件，用于配置大模型供应商、API 密钥以及通用设置（如猜你想问等）
 **/

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ProviderConfig,
  ModelProvider,
  OpenRouterModel,
  QuickQuestion,
  AssistantDisplayMode,
  FloatButtonClickAction,
} from '@/types';
import { PROVIDER_DEFINITIONS } from '@/config/providers';
import { aiService } from '@/services/ai';
import { ArrowLeft, Eye, EyeOff, Save, Check, RefreshCw, Loader2, Plus, Trash2, Pencil, MessageSquare } from 'lucide-react';

interface SettingsPanelProps {
  /** 当前供应商配置 */
  config: ProviderConfig;
  /** 保存配置回调 */
  onSave: (config: ProviderConfig) => Promise<void>;
  /** 返回按钮回调 */
  onBack: () => void;
  /** 获取指定供应商的配置 */
  getProviderConfig?: (provider: ModelProvider) => ProviderConfig;
  /** 翻译快捷键 */
  translateShortcut?: string;
  /** 更新翻译快捷键回调 */
  onUpdateTranslateShortcut?: (shortcut: string) => Promise<void>;
  /** 常用问题列表 */
  quickQuestions?: QuickQuestion[];
  /** 更新常用问题回调 */
  onUpdateQuickQuestions?: (questions: QuickQuestion[]) => Promise<void>;
  /** 助手打开方式 */
  assistantDisplayMode?: AssistantDisplayMode;
  /** 更新助手打开方式 */
  onUpdateAssistantDisplayMode?: (mode: AssistantDisplayMode) => Promise<void>;
  /** 浮窗主按钮点击行为 */
  floatButtonClickAction?: FloatButtonClickAction;
  /** 更新浮窗主按钮点击行为 */
  onUpdateFloatButtonClickAction?: (action: FloatButtonClickAction) => Promise<void>;
  /** 是否启用“猜你想问”引导问题 */
  enableSuggestedQuestions?: boolean;
  /** 更新“猜你想问”引导问题开关 */
  onUpdateEnableSuggestedQuestions?: (enabled: boolean) => Promise<void>;
}

/**
 * 设置面板组件
 */
export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  config,
  onSave,
  onBack,
  getProviderConfig,
  translateShortcut = 'Control',
  onUpdateTranslateShortcut,
  quickQuestions = [],
  onUpdateQuickQuestions,
  assistantDisplayMode = 'overlay',
  onUpdateAssistantDisplayMode,
  floatButtonClickAction = 'open',
  onUpdateFloatButtonClickAction,
  enableSuggestedQuestions = true,
  onUpdateEnableSuggestedQuestions,
}) => {
  // 表单状态
  const [provider, setProvider] = useState<ModelProvider>(config.provider);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl || '');
  const [model, setModel] = useState(config.model);

  // UI 状态
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // OpenRouter 免费模型列表
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // 标记是否是初始化加载
  const isInitialMount = useRef(true);
  // 常用问题编辑状态
  const [editingQuestion, setEditingQuestion] = useState<QuickQuestion | null>(null);
  const [newQuestionLabel, setNewQuestionLabel] = useState('');
  const [newQuestionPrompt, setNewQuestionPrompt] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // 获取当前供应商选项
  const currentProviderOption = PROVIDER_DEFINITIONS.find(p => p.value === provider);

  // 获取 OpenRouter 免费模型
  const fetchOpenRouterModels = async (currentModel?: string) => {
    setLoadingModels(true);
    try {
      const models = await aiService.getOpenRouterFreeModels();
      setOpenRouterModels(models);
      // 如果有模型且当前没有选择有效模型，默认选择第一个
      if (models.length > 0) {
        const hasValidModel = currentModel && models.some(m => m.id === currentModel);
        if (!hasValidModel) {
          setModel(models[0].id);
        }
      }
    } catch (error) {
      console.error('获取 OpenRouter 模型失败:', error);
    } finally {
      setLoadingModels(false);
    }
  };

  // 供应商变更时加载对应的已保存配置
  useEffect(() => {
    // 跳过初始化加载
    if (isInitialMount.current) {
      isInitialMount.current = false;
      // 初始化时，如果是 OpenRouter 供应商，加载模型列表
      if (provider === 'openrouter') {
        fetchOpenRouterModels(config.model);
      }
      return;
    }

    // 切换供应商时，加载已保存的配置
    if (getProviderConfig) {
      const savedConfig = getProviderConfig(provider);
      setApiKey(savedConfig.apiKey);
      setBaseUrl(savedConfig.baseUrl || currentProviderOption?.baseUrl || '');
      setModel(savedConfig.model);
    } else {
      // 如果没有 getProviderConfig，使用默认值
      setBaseUrl(currentProviderOption?.baseUrl || '');
      if (currentProviderOption?.models.length) {
        setModel(currentProviderOption.models[0]);
      }
    }

    // 如果选择了 OpenRouter，自动加载免费模型
    if (provider === 'openrouter') {
      const savedConfig = getProviderConfig?.(provider);
      fetchOpenRouterModels(savedConfig?.model);
    }
  }, [provider]);

  // 获取当前可用的模型列表
  const getAvailableModels = () => {
    if (provider === 'openrouter') {
      return openRouterModels.map(m => ({
        value: m.id,
        label: `${m.name}${m.contextLength ? ` (${Math.floor(m.contextLength / 1000)}K)` : ''}`,
      }));
    }
    return currentProviderOption?.models.map(m => ({
      value: m,
      label: m,
    })) || [];
  };

  // 保存配置
  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        provider,
        apiKey,
        baseUrl: baseUrl || undefined,
        model,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('保存失败:', error);
    } finally {
      setSaving(false);
    }
  };

  // 判断当前供应商是否已配置（有 API 密钥）
  const isProviderConfigured = (p: ModelProvider): boolean => {
    if (!getProviderConfig) return false;
    const config = getProviderConfig(p);
    return !!config.apiKey;
  };

  // 添加新的常用问题
  const handleAddQuestion = async () => {
    if (!newQuestionLabel.trim() || !newQuestionPrompt.trim() || !onUpdateQuickQuestions) return;
    const newQuestion: QuickQuestion = {
      id: Date.now().toString(),
      label: newQuestionLabel.trim(),
      prompt: newQuestionPrompt.trim(),
    };
    await onUpdateQuickQuestions([...quickQuestions, newQuestion]);
    setNewQuestionLabel('');
    setNewQuestionPrompt('');
    setShowAddForm(false);
  };

  // 删除常用问题
  const handleDeleteQuestion = async (id: string) => {
    if (!onUpdateQuickQuestions) return;
    await onUpdateQuickQuestions(quickQuestions.filter(q => q.id !== id));
  };

  // 保存编辑的常用问题
  const handleSaveEdit = async () => {
    if (!editingQuestion || !onUpdateQuickQuestions) return;
    await onUpdateQuickQuestions(
      quickQuestions.map(q => q.id === editingQuestion.id ? editingQuestion : q)
    );
    setEditingQuestion(null);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 头部 */}
      <div className="flex items-center gap-2 p-4 border-b">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">设置</h1>
      </div>

      {/* 内容区域 */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* 供应商选择 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">模型供应商</CardTitle>
              <CardDescription>选择您的 AI 模型提供商，已配置的供应商会显示 ✓</CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={provider}
                onChange={(e) => {
                  const newProvider = e.target.value as ModelProvider;
                  setProvider(newProvider);
                }}
                options={PROVIDER_DEFINITIONS.map(p => ({
                  value: p.value,
                  label: isProviderConfigured(p.value) ? `${p.label} ✓` : p.label,
                }))}
              />
            </CardContent>
          </Card>

          {/* API 密钥 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">API 密钥</CardTitle>
              <CardDescription>您的 API 密钥将安全存储在浏览器中</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="输入您的 API 密钥"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-10 w-10"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 模型选择 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">模型</CardTitle>
                  <CardDescription>
                    {provider === 'openrouter'
                      ? `选择免费模型 (${openRouterModels.length} 个可用)`
                      : '选择或输入模型名称'}
                  </CardDescription>
                </div>
                {provider === 'openrouter' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fetchOpenRouterModels()}
                    disabled={loadingModels}
                    title="刷新模型列表"
                  >
                    {loadingModels ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingModels ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在加载模型列表...
                </div>
              ) : (
                <Combobox
                  value={model}
                  onChange={setModel}
                  options={getAvailableModels()}
                  placeholder="选择或输入模型名称"
                />
              )}
            </CardContent>
          </Card>

          {/* API 基础 URL（自定义供应商或高级用户） */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">API 地址</CardTitle>
              <CardDescription>
                {provider === 'custom'
                  ? '输入 OpenAI 兼容的 API 地址'
                  : '可选，用于自定义代理地址'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </CardContent>
          </Card>

          {/* 悬停翻译快捷键 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">悬停翻译快捷键</CardTitle>
              <CardDescription>
                按住此键并将鼠标悬停在段落上即可翻译
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={translateShortcut}
                onChange={(e) => {
                  onUpdateTranslateShortcut?.(e.target.value);
                }}
                options={[
                  { value: 'Control', label: 'Ctrl' },
                  { value: 'Alt', label: 'Alt' },
                  { value: 'Shift', label: 'Shift' },
                  { value: 'Meta', label: 'Cmd (Mac)' },
                ]}
              />
              <p className="text-xs text-muted-foreground mt-2">
                💡 如果有选中文本，将优先翻译选中内容
              </p>
            </CardContent>
          </Card>

          {/* 助手打开方式 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">打开方式</CardTitle>
              <CardDescription>
                选择助手界面的显示形态
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select
                value={assistantDisplayMode}
                onChange={(e) => {
                  onUpdateAssistantDisplayMode?.(e.target.value as AssistantDisplayMode);
                }}
                options={[
                  { value: 'overlay', label: '页面内浮窗（不占用页面空间）' },
                  { value: 'window', label: '独立窗口（可移至副屏使用）' },
                  { value: 'sidepanel', label: '浏览器侧边栏（原生体验）' },
                ]}
              />
              <p className="text-xs text-muted-foreground">
                {assistantDisplayMode === 'overlay' && '浮窗悬浮在页面上方，可拖拽和调整大小，不会挤压页面内容'}
                {assistantDisplayMode === 'window' && '在独立浏览器窗口中打开，适合双屏使用或需要更大空间时'}
                {assistantDisplayMode === 'sidepanel' && '使用浏览器原生侧边栏，会占用一部分页面宽度'}
              </p>
            </CardContent>
          </Card>

          {/* 浮窗点击行为 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">浮窗点击行为</CardTitle>
              <CardDescription>
                点击右下角浮窗图标时，直接执行对应动作
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={floatButtonClickAction}
                onChange={(e) => {
                  onUpdateFloatButtonClickAction?.(e.target.value as FloatButtonClickAction);
                }}
                options={[
                  { value: 'open', label: '仅打开助手' },
                  { value: 'open_and_summarize', label: '打开并总结页面' },
                ]}
              />
            </CardContent>
          </Card>

          {/* 猜你想问开关 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>猜你想问</span>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={enableSuggestedQuestions}
                    onChange={(e) => onUpdateEnableSuggestedQuestions?.(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-background after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </CardTitle>
              <CardDescription>
                AI 对话或总结完毕后，自动在对话底部生成 3 个引导问题
              </CardDescription>
            </CardHeader>
          </Card>

          {/* 常用问题配置 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    常用问题
                  </CardTitle>
                  <CardDescription>
                    配置快捷提问，选中文本后可一键提问
                  </CardDescription>
                </div>
                {!showAddForm && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowAddForm(true)}
                    title="添加常用问题"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 添加新问题表单 */}
              {showAddForm && (
                <div className="p-3 border rounded-lg space-y-2 bg-muted/30">
                  <Input
                    value={newQuestionLabel}
                    onChange={(e) => setNewQuestionLabel(e.target.value)}
                    placeholder="按钮名称（如：翻译、解释、总结）"
                    className="h-8 text-sm"
                  />
                  <Input
                    value={newQuestionPrompt}
                    onChange={(e) => setNewQuestionPrompt(e.target.value)}
                    placeholder="提示词模板，使用 {{text}} 代表选中文本"
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleAddQuestion}
                      disabled={!newQuestionLabel.trim() || !newQuestionPrompt.trim()}
                      className="h-7 text-xs"
                    >
                      添加
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowAddForm(false);
                        setNewQuestionLabel('');
                        setNewQuestionPrompt('');
                      }}
                      className="h-7 text-xs"
                    >
                      取消
                    </Button>
                  </div>
                </div>
              )}

              {/* 常用问题列表 */}
              {quickQuestions.length === 0 && !showAddForm && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  暂无常用问题，点击右上角 + 添加
                </p>
              )}

              {quickQuestions.map((question) => (
                <div
                  key={question.id}
                  className="flex items-start gap-2 p-2 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  {editingQuestion?.id === question.id ? (
                    // 编辑模式
                    <div className="flex-1 space-y-2">
                      <Input
                        value={editingQuestion.label}
                        onChange={(e) => setEditingQuestion({...editingQuestion, label: e.target.value})}
                        placeholder="按钮名称"
                        className="h-7 text-sm"
                      />
                      <Input
                        value={editingQuestion.prompt}
                        onChange={(e) => setEditingQuestion({...editingQuestion, prompt: e.target.value})}
                        placeholder="提示词模板"
                        className="h-7 text-sm"
                      />
                      <div className="flex gap-1">
                        <Button size="sm" onClick={handleSaveEdit} className="h-6 text-xs px-2">
                          保存
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingQuestion(null)}
                          className="h-6 text-xs px-2"
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // 显示模式
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{question.label}</div>
                        <div className="text-xs text-muted-foreground truncate" title={question.prompt}>
                          {question.prompt}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setEditingQuestion(question)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteQuestion(question.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}

              <p className="text-xs text-muted-foreground">
                💡 在提示词中使用 <code className="bg-muted px-1 rounded">{'{{text}}'}</code> 代表选中的文本
              </p>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* 底部保存按钮 */}
      <div className="p-4 border-t">
        <Button
          className="w-full"
          onClick={handleSave}
          disabled={saving || !apiKey}
        >
          {saving ? (
            '保存中...'
          ) : saved ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              已保存
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              保存设置
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
