/**
 * @Author wei
 * @Date 2026-02-07
 * @Description Chrome 存储服务，使用 chrome.storage.sync 同步用户配置
 **/

import { AppSettings, ProviderConfig } from '@/types';

// 存储键名常量
const STORAGE_KEYS = {
  SETTINGS: 'ai_sidebar_settings',
} as const;

// 默认供应商配置
const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  provider: 'openai',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
};

// 默认应用设置
const DEFAULT_SETTINGS: AppSettings = {
  providerConfig: DEFAULT_PROVIDER_CONFIG,
  theme: 'system',
};

/**
 * 存储服务类，封装 chrome.storage.sync 操作
 */
class StorageService {
  /**
   * 获取应用设置
   * @returns 应用设置对象
   */
  async getSettings(): Promise<AppSettings> {
    try {
      const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
      const settings = result[STORAGE_KEYS.SETTINGS];

      if (!settings) {
        return DEFAULT_SETTINGS;
      }

      // 合并默认设置以确保新字段有默认值
      return {
        ...DEFAULT_SETTINGS,
        ...settings,
        providerConfig: {
          ...DEFAULT_PROVIDER_CONFIG,
          ...settings.providerConfig,
        },
      };
    } catch (error) {
      console.error('获取设置失败:', error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * 保存应用设置
   * @param settings - 要保存的设置对象
   */
  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      await chrome.storage.sync.set({
        [STORAGE_KEYS.SETTINGS]: settings,
      });
    } catch (error) {
      console.error('保存设置失败:', error);
      throw new Error('保存设置失败');
    }
  }

  /**
   * 更新供应商配置
   * @param config - 供应商配置
   */
  async updateProviderConfig(config: ProviderConfig): Promise<void> {
    const settings = await this.getSettings();
    settings.providerConfig = config;
    await this.saveSettings(settings);
  }

  /**
   * 更新主题设置
   * @param theme - 主题模式
   */
  async updateTheme(theme: AppSettings['theme']): Promise<void> {
    const settings = await this.getSettings();
    settings.theme = theme;
    await this.saveSettings(settings);
  }

  /**
   * 清除所有设置
   */
  async clearSettings(): Promise<void> {
    try {
      await chrome.storage.sync.remove(STORAGE_KEYS.SETTINGS);
    } catch (error) {
      console.error('清除设置失败:', error);
      throw new Error('清除设置失败');
    }
  }
}

// 导出单例实例
export const storageService = new StorageService();
