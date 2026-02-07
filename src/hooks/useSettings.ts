/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 设置 Hook，管理应用设置状态
 **/

import { useState, useEffect, useCallback } from 'react';
import { AppSettings, ProviderConfig } from '@/types';
import { storageService } from '@/services/storage';

// 默认设置
const DEFAULT_SETTINGS: AppSettings = {
  providerConfig: {
    provider: 'openai',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  theme: 'system',
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

  // 更新供应商配置
  const updateProviderConfig = useCallback(async (config: ProviderConfig) => {
    const newSettings = { ...settings, providerConfig: config };
    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  // 更新主题
  const updateTheme = useCallback(async (theme: AppSettings['theme']) => {
    const newSettings = { ...settings, theme };
    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  // 检查配置是否有效
  const isConfigValid = useCallback(() => {
    return !!(
      settings.providerConfig.apiKey &&
      settings.providerConfig.model
    );
  }, [settings]);

  return {
    settings,
    loading,
    error,
    saveSettings,
    updateProviderConfig,
    updateTheme,
    isConfigValid,
  };
}
