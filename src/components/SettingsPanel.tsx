/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 设置面板组件，用于配置大模型供应商和 API 密钥
 **/

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ProviderConfig, ProviderOption, ModelProvider } from '@/types';
import { ArrowLeft, Eye, EyeOff, Save, Check } from 'lucide-react';

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
}

/**
 * 设置面板组件
 */
export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  config,
  onSave,
  onBack,
}) => {
  // 表单状态
  const [provider, setProvider] = useState<ModelProvider>(config.provider);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl || '');
  const [model, setModel] = useState(config.model);
  const [customModel, setCustomModel] = useState('');

  // UI 状态
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 获取当前供应商选项
  const currentProviderOption = PROVIDER_OPTIONS.find(p => p.value === provider);

  // 供应商变更时更新默认值
  useEffect(() => {
    if (currentProviderOption) {
      setBaseUrl(currentProviderOption.defaultBaseUrl);
      if (currentProviderOption.models.length > 0) {
        setModel(currentProviderOption.models[0]);
      }
    }
  }, [provider, currentProviderOption]);

  // 保存配置
  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        provider,
        apiKey,
        baseUrl: baseUrl || undefined,
        model: provider === 'custom' && customModel ? customModel : model,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('保存失败:', error);
    } finally {
      setSaving(false);
    }
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
              <CardDescription>选择您的 AI 模型提供商</CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={provider}
                onChange={(e) => setProvider(e.target.value as ModelProvider)}
                options={PROVIDER_OPTIONS.map(p => ({
                  value: p.value,
                  label: p.label,
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
              <CardTitle className="text-base">模型</CardTitle>
              <CardDescription>选择要使用的模型</CardDescription>
            </CardHeader>
            <CardContent>
              {provider === 'custom' ? (
                <Input
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="输入模型名称，如 gpt-4"
                />
              ) : (
                <Select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  options={
                    currentProviderOption?.models.map(m => ({
                      value: m,
                      label: m,
                    })) || []
                  }
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
