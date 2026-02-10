/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 设置面板组件，用于配置大模型供应商和 API 密钥
 **/

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ProviderConfig, ProviderOption, ModelProvider, OpenRouterModel } from '@/types';
import { aiService } from '@/services/ai';
import { ArrowLeft, Eye, EyeOff, Save, Check, RefreshCw, Loader2 } from 'lucide-react';

// 供应商选项配置
const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: 'openai',
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
  {
    value: 'anthropic',
    label: 'Anthropic (Claude)',
    models: ['claude-sonnet-4-5-20250929', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    defaultBaseUrl: 'https://api.anthropic.com/v1',
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultBaseUrl: 'https://api.deepseek.com/v1',
  },
  {
    value: 'zhipu',
    label: '智谱 AI (免费)',
    models: ['glm-4.7-flash', 'glm-4.6v-flash', 'glm-4.1v-thinking-flash', 'glm-4-flash-250414', 'glm-4v-flash'],
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter (免费模型)',
    models: [], // 将动态加载
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
  },
  {
    value: 'custom',
    label: '自定义 (OpenAI 兼容)',
    models: [],
    defaultBaseUrl: '',
  },
];

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

  // 获取当前供应商选项
  const currentProviderOption = PROVIDER_OPTIONS.find(p => p.value === provider);

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
      setBaseUrl(savedConfig.baseUrl || currentProviderOption?.defaultBaseUrl || '');
      setModel(savedConfig.model);
    } else {
      // 如果没有 getProviderConfig，使用默认值
      setBaseUrl(currentProviderOption?.defaultBaseUrl || '');
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
                options={PROVIDER_OPTIONS.map(p => ({
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
