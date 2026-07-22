/**
 * QueryExecutor - Routes queries to AI models with multi-step tool execution
 */

const fs = require('fs');
const path = require('path');
const { getTools } = require('../tools/ToolRegistry');

class QueryExecutor {
  constructor(agent) {
    this.agent = agent;
  }

  async _prepareConfig(query, context) {
    const llm = this.agent.llmRegistry.getActiveProvider();
    const model = await llm.getModelInstance();
    const tools = await getTools(this.agent);

    // 1. Build core persona instructions — prefer ContextEngine persona if available
    let systemPrompt;
    let contextEngineTools = {};
    let ceMessages = [];
    if (this.agent.contextEngine) {
      try {
        const conversationId = context.conversationId || 'default';
        const ceCtx = this.agent.contextEngine.buildContext({
          conversationId,
          activeNotePath: context.currentFile || null,
          activeNoteContent: context.activeNoteContent || null
        });
        systemPrompt = ceCtx.system;
        contextEngineTools = ceCtx.tools || {};
        ceMessages = ceCtx.messages || [];
      } catch (ceErr) {
        console.warn('[QueryExecutor] ContextEngine.buildContext failed, falling back:', ceErr.message);
      }
    }
    // Load core system instructions from markdown file
    let baseInstructions = '';
    try {
      const promptPath = path.join(__dirname, 'system_prompt.md');
      if (fs.existsSync(promptPath)) {
        baseInstructions = fs.readFileSync(promptPath, 'utf8');
      }
    } catch (readErr) {
      console.warn('[QueryExecutor] Failed to read system_prompt.md:', readErr.message);
    }

    // Combine base instructions with the active persona instructions
    let finalSystemPrompt = baseInstructions || 'You are a helpful AI assistant for Notely, a modern markdown notes application.';
    if (systemPrompt) {
      finalSystemPrompt += `\n\n---\nACTIVE PERSONA ROLE/INSTRUCTIONS:\n${systemPrompt}`;
    } else if (context.systemPrompt) {
      finalSystemPrompt += `\n\n---\nACTIVE PERSONA ROLE/INSTRUCTIONS:\n${context.systemPrompt}`;
    }

    // Append workspace context metadata
    finalSystemPrompt += `\n\nWorkspace context:
- Workspace folder: ${this.agent.workspaceRoot || 'none'}
- Current open note path: ${context.currentFile || 'none'}`;

    if (context.relatedDocuments && context.relatedDocuments.length > 0) {
      finalSystemPrompt += `\n- Related documents:`;
      context.relatedDocuments.forEach(doc => {
        finalSystemPrompt += `\n  * ${doc.path}`;
      });
    }

    systemPrompt = finalSystemPrompt;

    const mergedTools = {
      ...tools,
      ...contextEngineTools
    };

    let toolChoice = 'auto';

    // Build messages array
    let messages = [];
    if (ceMessages.length > 0) {
      messages = [...ceMessages];
      if (messages[messages.length - 1]?.content !== query || messages[messages.length - 1]?.role !== 'user') {
        messages.push({ role: 'user', content: query });
      }
    } else {
      messages = [{ role: 'user', content: query }];
    }

    return { model, systemPrompt, messages, mergedTools, llm, toolChoice };
  }

  /**
   * Execute a query using Vercel AI SDK and the tool registry
   */
  async execute(query, context = {}) {
    try {
      const { generateText } = await import('ai');
      const { model, systemPrompt, messages, mergedTools, llm, toolChoice } = await this._prepareConfig(query, context);

      const result = await generateText({
        model,
        system: systemPrompt,
        messages,
        tools: mergedTools,
        toolChoice,
        maxSteps: 5 // Allow multi-step tool calls
      });

      let tokensUsed = result.usage?.totalTokens || 0;
      if (llm.usageStats) {
        llm.usageStats.tokensUsedTotal += tokensUsed;
        llm.usageStats.requestsTotal += 1;
      }

      let textResult = result.text;

      // Extract all tool calls and their results from all steps
      const allToolCalls = [];
      const toolResultsContent = [];
      if (result.steps) {
        for (const step of result.steps) {
          if (step.toolCalls && step.toolCalls.length > 0) {
            allToolCalls.push(...step.toolCalls);
          }
          if (step.toolResults && step.toolResults.length > 0) {
            toolResultsContent.push(...step.toolResults);
          }
        }
      }

      // Manual fallback summary generation if tool calls were made but no final text was output
      if (!textResult && allToolCalls.length > 0) {
        try {
          const nextMessages = [...messages];
          if (nextMessages.length > 0 && nextMessages[nextMessages.length - 1].role === 'user') {
            let toolContext = `I executed the following tools to help answer the request:`;
            for (const tr of toolResultsContent) {
              const val = tr.output !== undefined ? tr.output : tr.result;
              toolContext += `\n\n- Tool: ${tr.toolName}\nOutput: ${typeof val === 'object' ? JSON.stringify(val) : val}`;
            }
            toolContext += `\n\nBased on these tool outputs, please provide a friendly, structured, and concise natural language response to my query: "${query}".`;
            
            nextMessages[nextMessages.length - 1] = {
              role: 'user',
              content: toolContext
            };

            const summaryResult = await generateText({
              model,
              system: systemPrompt,
              messages: nextMessages
            });

            if (summaryResult.text) {
              textResult = summaryResult.text;
              const extraTokens = summaryResult.usage?.totalTokens || 0;
              tokensUsed += extraTokens;
              if (llm.usageStats) {
                llm.usageStats.tokensUsedTotal += extraTokens;
              }
            }
          }
        } catch (summaryErr) {
          console.error('[QueryExecutor] Manual summary fallback failed:', summaryErr.message);
        }
      }

      // Raw formatting fallback if manual summary did not succeed
      if (!textResult && result.steps && result.steps.length > 0) {
        let formattedOutput = '';
        for (const step of result.steps) {
          if (step.toolCalls && step.toolCalls.length > 0) {
            for (const call of step.toolCalls) {
              const stepResult = result.steps.find(s => s.toolResults && s.toolResults.some(r => r.toolCallId === call.toolCallId));
              const toolResult = stepResult?.toolResults?.find(r => r.toolCallId === call.toolCallId);
              if (toolResult) {
                const val = toolResult.output !== undefined ? toolResult.output : toolResult.result;
                formattedOutput += `\n\n#### Tool Output: ${call.toolName}\n`;
                if (typeof val === 'string') {
                  try {
                    const parsed = JSON.parse(val);
                    formattedOutput += `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
                  } catch {
                    formattedOutput += val;
                  }
                } else if (typeof val === 'object' && val !== null) {
                  formattedOutput += `\`\`\`json\n${JSON.stringify(val, null, 2)}\n\`\`\``;
                } else {
                  formattedOutput += `${val}`;
                }
              }
            }
          }
        }
        if (formattedOutput) {
          textResult = `I executed tools to fetch this information for you:${formattedOutput}`;
        }
      }

      // Construct the trace array of executed tools and outputs
      const trace = [];
      if (result.steps) {
        for (const step of result.steps) {
          if (step.toolCalls) {
            for (const call of step.toolCalls) {
              const stepResult = result.steps.find(s => s.toolResults && s.toolResults.some(r => r.toolCallId === call.toolCallId));
              const toolResult = stepResult?.toolResults?.find(r => r.toolCallId === call.toolCallId);
              trace.push({
                name: call.toolName,
                args: call.args,
                output: toolResult ? (toolResult.output !== undefined ? toolResult.output : toolResult.result) : null
              });
            }
          }
        }
      }

      return {
        type: 'query',
        result: textResult || "AI query completed with no text output.",
        tokensUsed,
        trace
      };
    } catch (error) {
      console.error('[QueryExecutor] Execution failed:', error.message);
      throw error;
    }
  }

  /**
   * Stream a query using Vercel AI SDK streamText
   */
  async stream(query, context = {}, onChunk, abortSignal) {
    try {
      const { streamText } = await import('ai');
      const { model, systemPrompt, messages, mergedTools, llm, toolChoice } = await this._prepareConfig(query, context);

      const result = await streamText({
        model,
        system: systemPrompt,
        messages,
        tools: mergedTools,
        toolChoice,
        maxSteps: 5,
        abortSignal
      });

      let fullText = '';
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            const delta = part.textDelta !== undefined ? part.textDelta : (part.text || '');
            fullText += delta;
            if (onChunk) {
              onChunk({ type: 'text', content: delta });
            }
          }
        }
      } catch (streamIterErr) {
        console.warn('[QueryExecutor] Error iterating fullStream:', streamIterErr.message);
      }

      if (!fullText) {
        console.log('[QueryExecutor] Stream returned empty text. Falling back to non-streaming execution...');
        return this.execute(query, context);
      }

      const usage = await result.usage;
      const tokensUsed = usage?.totalTokens || 0;
      if (llm.usageStats) {
        llm.usageStats.tokensUsedTotal += tokensUsed;
        llm.usageStats.requestsTotal += 1;
      }

      const steps = await result.steps;
      const trace = [];
      if (steps) {
        for (const step of steps) {
          if (step.toolCalls) {
            for (const call of step.toolCalls) {
              const stepResult = steps.find(s => s.toolResults && s.toolResults.some(r => r.toolCallId === call.toolCallId));
              const toolResult = stepResult?.toolResults?.find(r => r.toolCallId === call.toolCallId);
              trace.push({
                name: call.toolName,
                args: call.args,
                output: toolResult ? (toolResult.output !== undefined ? toolResult.output : toolResult.result) : null
              });
            }
          }
        }
      }

      return {
        type: 'query',
        result: fullText,
        tokensUsed,
        trace
      };
    } catch (error) {
      if (error.name === 'AbortError' || abortSignal?.aborted) {
        console.log('[QueryExecutor] Stream execution aborted by user.');
        return { type: 'aborted', result: 'Generation stopped.' };
      }
      console.error('[QueryExecutor] Stream execution failed:', error.message);
      throw error;
    }
  }
}

module.exports = QueryExecutor;
