import { UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";

/**
 * Reasoning content store for multi-turn conversations.
 * 
 * DeepSeek V4 and MiMo thinking mode requires that the reasoning_content
 * from any assistant turn that performed tool calls be sent back on the
 * assistant message in every subsequent request.
 * 
 * This store captures reasoning_content from responses and reinjects it
 * on subsequent requests using tool_call IDs as a stable key.
 * 
 * Merged from PR #1376 (reasoning store) and PR #1375 (bidirectional conversion)
 */
const REASONING_STORE = new Map<string, string>();
const REASONING_STORE_LIMIT = 1000;

function storeReasoning(key: string, value: string): void {
  if (REASONING_STORE.size >= REASONING_STORE_LIMIT) {
    const firstKey = REASONING_STORE.keys().next().value;
    if (firstKey !== undefined) REASONING_STORE.delete(firstKey);
  }
  REASONING_STORE.set(key, value);
}

function keyFromToolCalls(toolCalls: any): string | null {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;
  const ids: string[] = toolCalls
    .map((tc: any) => tc && tc.id)
    .filter((id: any): id is string => typeof id === "string" && id.length > 0);
  if (ids.length === 0) return null;
  return ids.slice().sort().join("|");
}

export class DeepseekTransformer implements Transformer {
  name = "deepseek";

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    // Limit max_tokens for DeepSeek
    if (request.max_tokens && request.max_tokens > 8192) {
      request.max_tokens = 8192;
    }
    
    // Convert thinking → reasoning_content (from PR #1375)
    // This handles the case where Claude Code sends thinking content
    if (request.messages) {
      for (const message of request.messages) {
        if (message.role === "assistant" && message.thinking) {
          if (message.thinking.content) {
            (message as any).reasoning_content = message.thinking.content;
          }
          delete (message as any).thinking;
        }
      }
    }
    
    // Reinject stored reasoning_content for tool-call messages (from PR #1376)
    // This handles multi-turn conversations where Claude Code strips reasoning_content
    if (request && Array.isArray((request as any).messages)) {
      for (const msg of (request as any).messages) {
        if (!msg || msg.role !== "assistant") continue;
        // Skip if reasoning_content already exists
        if (typeof msg.reasoning_content === "string" && msg.reasoning_content) continue;
        // Look up stored reasoning by tool_call IDs
        const key = keyFromToolCalls(msg.tool_calls);
        if (!key) continue;
        const stored = REASONING_STORE.get(key);
        if (stored) msg.reasoning_content = stored;
      }
    }
    
    // Convert reasoning → thinking parameters (from PR #1375)
    // This handles the thinking mode configuration
    if ((request as any).reasoning) {
      (request as any).thinking = {
        type: "enabled",
      };
      if ((request as any).reasoning.effort) {
        (request as any).reasoning_effort = (request as any).reasoning.effort;
      }
      delete (request as any).reasoning;
    }
    
    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse: any = await response.json();
      
      // Handle non-streaming: reasoning_content → thinking (from PR #1375)
      if (jsonResponse.choices?.[0]?.message?.reasoning_content) {
        const reasoningContent = jsonResponse.choices[0].message.reasoning_content;
        jsonResponse.choices[0].message.thinking = {
          content: reasoningContent,
        };
        // Store for potential multi-turn use (from PR #1376)
        const toolCalls = jsonResponse.choices?.[0]?.message?.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          const key = keyFromToolCalls(toolCalls);
          if (key) storeReasoning(key, reasoningContent);
        }
        delete jsonResponse.choices[0].message.reasoning_content;
      }
      
      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } else if (response.headers.get("Content-Type")?.includes("stream")) {
      if (!response.body) {
        return response;
      }

      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let reasoningContent = "";
      let isReasoningComplete = false;
      let buffer = "";
      const toolCallIds: string[] = []; // Collect tool_call IDs for reasoning store

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();
          const processBuffer = (
            buffer: string,
            controller: ReadableStreamDefaultController,
            encoder: TextEncoder
          ) => {
            const lines = buffer.split("\n");
            for (const line of lines) {
              if (line.trim()) {
                controller.enqueue(encoder.encode(line + "\n"));
              }
            }
          };

          const processLine = (
            line: string,
            context: {
              controller: ReadableStreamDefaultController;
              encoder: TextEncoder;
              reasoningContent: () => string;
              appendReasoningContent: (content: string) => void;
              isReasoningComplete: () => boolean;
              setReasoningComplete: (val: boolean) => void;
            }
          ) => {
            const { controller, encoder } = context;

            if (
              line.startsWith("data: ") &&
              line.trim() !== "data: [DONE]"
            ) {
              try {
                const data = JSON.parse(line.slice(6));

                // Collect tool_call IDs from delta (from PR #1376)
                const deltaToolCalls = data.choices?.[0]?.delta?.tool_calls;
                if (Array.isArray(deltaToolCalls)) {
                  for (const tc of deltaToolCalls) {
                    if (tc?.id && typeof tc.id === "string" && tc.id.length > 0) {
                      if (!toolCallIds.includes(tc.id)) {
                        toolCallIds.push(tc.id);
                      }
                    }
                  }
                }

                // Extract reasoning_content from delta
                if (data.choices?.[0]?.delta?.reasoning_content) {
                  context.appendReasoningContent(
                    data.choices[0].delta.reasoning_content
                  );
                  const thinkingChunk = {
                    ...data,
                    choices: [
                      {
                        ...data.choices[0],
                        delta: {
                          ...data.choices[0].delta,
                          thinking: {
                            content: data.choices[0].delta.reasoning_content,
                          },
                        },
                      },
                    ],
                  };
                  delete thinkingChunk.choices[0].delta.reasoning_content;
                  const thinkingLine = `data: ${JSON.stringify(
                    thinkingChunk
                  )}\n\n`;
                  controller.enqueue(encoder.encode(thinkingLine));
                  return;
                }

                // Check if reasoning is complete (when delta has content but no reasoning_content)
                if (
                  data.choices?.[0]?.delta?.content &&
                  context.reasoningContent() &&
                  !context.isReasoningComplete()
                ) {
                  context.setReasoningComplete(true);
                  const signature = Date.now().toString();

                  // Create a new chunk with thinking block
                  const thinkingChunk = {
                    ...data,
                    choices: [
                      {
                        ...data.choices[0],
                        delta: {
                          ...data.choices[0].delta,
                          content: null,
                          thinking: {
                            content: context.reasoningContent(),
                            signature: signature,
                          },
                        },
                      },
                    ],
                  };
                  delete thinkingChunk.choices[0].delta.reasoning_content;
                  // Send the thinking chunk
                  const thinkingLine = `data: ${JSON.stringify(
                    thinkingChunk
                  )}\n\n`;
                  controller.enqueue(encoder.encode(thinkingLine));
                }

                if (data.choices[0]?.delta?.reasoning_content) {
                  delete data.choices[0].delta.reasoning_content;
                }

                // Send the modified chunk
                if (
                  data.choices?.[0]?.delta &&
                  Object.keys(data.choices[0].delta).length > 0
                ) {
                  if (context.isReasoningComplete()) {
                    data.choices[0].index++;
                  }
                  const modifiedLine = `data: ${JSON.stringify(data)}\n\n`;
                  controller.enqueue(encoder.encode(modifiedLine));
                }
              } catch (e) {
                // If JSON parsing fails, pass through the original line
                controller.enqueue(encoder.encode(line + "\n"));
              }
            } else {
              // Pass through non-data lines (like [DONE])
              controller.enqueue(encoder.encode(line + "\n"));
            }
          };

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                // Process remaining buffer
                if (buffer.trim()) {
                  processBuffer(buffer, controller, encoder);
                }
                
                // Store reasoning content for multi-turn use (from PR #1376)
                if (toolCallIds.length > 0 && reasoningContent) {
                  const key = toolCallIds.slice().sort().join("|");
                  storeReasoning(key, reasoningContent);
                }
                
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;

              // 处理缓冲区中完整的数据行
              const lines = buffer.split("\n");
              buffer = lines.pop() || ""; // 最后一行可能不完整，保留在缓冲区

              for (const line of lines) {
                if (!line.trim()) continue;

                try {
                  processLine(line, {
                    controller,
                    encoder,
                    reasoningContent: () => reasoningContent,
                    appendReasoningContent: (content) =>
                      (reasoningContent += content),
                    isReasoningComplete: () => isReasoningComplete,
                    setReasoningComplete: (val) => (isReasoningComplete = val),
                  });
                } catch (error) {
                  console.error("Error processing line:", line, error);
                  // 如果解析失败，直接传递原始行
                  controller.enqueue(encoder.encode(line + "\n"));
                }
              }
            }
          } catch (error) {
            console.error("Stream error:", error);
            controller.error(error);
          } finally {
            try {
              reader.releaseLock();
            } catch (e) {
              console.error("Error releasing reader lock:", e);
            }
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type": response.headers.get("Content-Type") || "text/plain",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return response;
  }
}
