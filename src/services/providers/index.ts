/**
 * @Author wei
 * @Date 2026-03-30
 * @Description AI 供应商接口定义
 **/

import { ProviderConfig, APIResponse, ChatMessage } from '@/types';

/**
 * AI 供应商接口
 */
export interface AIProvider {
  /**
   * 发送聊天请求
   * @param config - 供应商配置
   * @param messages - 聊天消息历史
   * @param systemPrompt - 系统提示词
   * @param onStream - 流式响应回调
   * @param enableReasoning - 是否启用思考模式
   */
  chat(
    config: ProviderConfig,
    messages: ChatMessage[],
    systemPrompt?: string,
    onStream?: (chunk: string) => void,
    enableReasoning?: boolean
  ): Promise<APIResponse>;
}
