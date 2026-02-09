/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 设置 Hook，管理应用设置状态
 **/

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppSettings, ProviderConfig, ModelProvider } from '@/types';
import { storageService } from '@/services/storage';

// 默认设置
const DEFAULT_SETTINGS: AppSettings = {
  currentProvider: 'openai',
  providerConfigs: {},
  theme: 'system',
  enableReasoning: false,
};

/**
 * 设置管理 Hook
 * @returns 设置状态和操作方法
 */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const savedSettings = await storageService.getSettings();
        setSettings(savedSettings);
        setError(null);
      } catch (err) {
        setError('加载设置失败');
        console.error('加载设置失败:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  // 计算当前供应商配置（兼容旧代码）
  const providerConfig = useMemo(() => {
    const currentProvider = settings.currentProvider;
    const config = settings.providerConfigs[currentProvider];

    if (config) {
      return config;
    }

    // 返回默认配置
    return storageService.getDefaultProviderConfig(currentProvider);
  }, [settings]);

  // 兼容旧代码：提供包含 providerConfig 的 settings 对象
  const compatibleSettings = useMemo(() => ({
    ...settings,
    providerConfig,
  }), [settings, providerConfig]);

  // 保存设置
  const saveSettings = useCallback(async (newSettings: AppSettings) => {
    try {
      await storageService.saveSettings(newSettings);
      setSettings(newSettings);
      setError(null);
    } catch (err) {
      setError('保存设置失败');
      console.error('保存设置失败:', err);
      throw err;
    }
  }, []);

  // 更新供应商配置（同时切换到该供应商）
  const updateProviderConfig = useCallback(async (config: ProviderConfig) => {
    const newSettings: AppSettings = {
      ...settings,
      currentProvider: config.provider,
      providerConfigs: {
        ...settings.providerConfigs,
        [config.provider]: config,
      },
    };
    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  // 获取指定供应商的配置
  const getProviderConfig = useCallback((provider: ModelProvider): ProviderConfig => {
    const config = settings.providerConfigs[provider];
    if (config) {
      return config;
    }
    return storageService.getDefaultProviderConfig(provider);
  }, [settings]);

  // 切换当前供应商（不修改配置）
  const switchProvider = useCallback(async (provider: ModelProvider) => {
    const newSettings: AppSettings = {
      ...settings,
      currentProvider: provider,
    };
    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  // 更新主题
  const updateTheme = useCallback(async (theme: AppSettings['theme']) => {
    const newSettings = { ...settings, theme };
    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  // 更新思考模式开关
  const updateEnableReasoning = useCallback(async (enabled: boolean) => {
    const newSettings = { ...settings, enableReasoning: enabled };
    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  // 检查配置是否有效
  const isConfigValid = useCallback(() => {
    return !!(providerConfig.apiKey && providerConfig.model);
  }, [providerConfig]);

  return {
    settings: compatibleSettings,
    loading,
    error,
    saveSettings,
    updateProviderConfig,
    getProviderConfig,
    switchProvider,
    updateTheme,
    updateEnableReasoning,
    isConfigValid,
  };
}
