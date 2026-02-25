/**
 * @Author wei
 * @Date 2026-02-24
 * @Description SSE（Server-Sent Events）流式响应工具函数
 *
 * 封装所有供应商共用的底层读流逻辑：
 *   ReadableStream 逐块读取 → TextDecoder 解码 → 按行分割 → JSON 解析
 *
 * 调用方只需提供 onData 回调，专注于各自的业务数据提取，
 * 无需关心底层的流读取细节。
 **/

/**
 * 读取并解析 SSE 流，将每个有效的 JSON 事件传递给回调函数。
 *
 * 处理细节：
 * - 使用 `{ stream: true }` 解码，正确处理跨 chunk 的多字节字符（如中文）
 * - 自动跳过 `[DONE]` 终止标记（OpenAI 协议约定）
 * - 忽略无法解析的行（注释行、心跳包、空行等）
 * - finally 块中释放 reader 锁，确保资源不泄漏
 *
 * @param body    - Response.body，即 fetch 响应的 ReadableStream
 * @param onData  - 每解析到一个有效 JSON 对象时调用；
 *                  调用方通过此回调提取所需字段并驱动 UI 更新
 */
export async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  onData: (parsed: unknown) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // stream: true 告知解码器当前 chunk 后面可能还有数据，
      // 避免在 chunk 边界处错误解码多字节字符
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

      for (const line of lines) {
        const data = line.replace(/^data:\s*/, '');
        // OpenAI 协议的流结束标记，跳过（Anthropic 不发此标记，无影响）
        if (data === '[DONE]') continue;

        try {
          onData(JSON.parse(data));
        } catch {
          // 忽略非 JSON 行：空行、注释（: ping）、格式异常行等
        }
      }
    }
  } finally {
    // 无论正常结束还是中途抛出异常，都释放 reader 锁
    reader.releaseLock();
  }
}
