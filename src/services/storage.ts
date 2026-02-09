/**
 * @Author wei
 * @Date 2026-02-07
 * @Description Chrome 存储服务，使用 chrome.storage.sync 同步用户配置
 **/

import { AppSettings, ProviderConfig, ModelProvider } from '@/types';

// 存储键名常量
const STORAGE_KEYS = {
  SETTINGS: 'ai_sidebar_settings',
} as const;

// 默认供应商配置模板
const DEFAULT_PROVIDER_CONFIGS: Record<ModelProvider, ProviderConfig> = {
  openai: {
    provider: 'openai',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  anthropic: {
    provider: 'anthropic',
    apiKey: '',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-5-20250929',
  },
  deepseek: {
    provider: 'deepseek',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  openrouter: {
    provider: 'openrouter',
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: '',
  },
  custom: {
    provider: 'custom',
    apiKey: '',
    baseUrl: '',
    model: '',
  },
};

// 默认应用设置
const DEFAULT_SETTINGS: AppSettings = {
  currentProvider: 'openai',
  providerConfigs: {},
  theme: 'system',
  enableReasoning: false,
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

      // 兼容旧版本数据结构迁移
      if (settings.providerConfig && !settings.providerConfigs) {
        // 旧版本只有单个 providerConfig，迁移到新结构
        const oldConfig = settings.providerConfig as ProviderConfig;
        return {
          currentProvider: oldConfig.provider,
          providerConfigs: {
            [oldConfig.provider]: oldConfig,
          },
          theme: settings.theme || 'system',
          enableReasoning: false,
        };
      }

      // 合并默认设置以确保新字段有默认值
      return {
        ...DEFAULT_SETTINGS,
        ...settings,
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
   * 更新指定供应商的配置
   * @param config - 供应商配置
   */
  async updateProviderConfig(config: ProviderConfig): Promise<void> {
    const settings = await this.getSettings();
    settings.providerConfigs[config.provider] = config;
    settings.currentProvider = config.provider;
    await this.saveSettings(settings);
  }

  /**
   * 获取当前激活的供应商配置
   * @returns 当前供应商配置
   */
  async getCurrentProviderConfig(): Promise<ProviderConfig> {
    const settings = await this.getSettings();
    const currentProvider = settings.currentProvider;
    const config = settings.providerConfigs[currentProvider];

    if (config) {
      return config;
    }

    // 返回默认配置
    return DEFAULT_PROVIDER_CONFIGS[currentProvider];
  }

  /**
   * 获取指定供应商的配置
   * @param provider - 供应商标识
   * @returns 供应商配置（如果已保存）或默认配置
   */
  async getProviderConfig(provider: ModelProvider): Promise<ProviderConfig> {
    const settings = await this.getSettings();
    const config = settings.providerConfigs[provider];

    if (config) {
      return config;
    }

    // 返回默认配置
    return DEFAULT_PROVIDER_CONFIGS[provider];
  }

  /**
   * 切换当前使用的供应商
   * @param provider - 供应商标识
   */
  async switchProvider(provider: ModelProvider): Promise<void> {
    const settings = await this.getSettings();
    settings.currentProvider = provider;
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
   * 更新思考模式开关
   * @param enabled - 是否启用思考模式
   */
  async updateEnableReasoning(enabled: boolean): Promise<void> {
    const settings = await this.getSettings();
    settings.enableReasoning = enabled;
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

  /**
   * 获取默认供应商配置
   * @param provider - 供应商标识
   * @returns 默认配置
   */
  getDefaultProviderConfig(provider: ModelProvider): ProviderConfig {
    return { ...DEFAULT_PROVIDER_CONFIGS[provider] };
  }
}

// 导出单例实例
export const storageService = new StorageService();
