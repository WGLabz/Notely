/**
 * ContextOrchestrator - Dynamic multi-tool planning, parallel retrieval & context aggregation engine
 *
 * Implements the complete multi-tool planning workflow:
 * 1. Intent understanding & internal plan generation (never exposed to user)
 * 2. Parallel retrieval execution across candidate tools
 * 3. Dynamic tool output chaining
 * 4. Context aggregation (deduplication, ranking, source attribution)
 * 5. Confidence evaluation & iterative retrieval loop until confidence target is satisfied
 * 6. Structured evidence handoff to Reasoning layer
 */

const Planner = require('./Planner');
const { createLogger } = require('./logger');
const log = createLogger('ContextOrchestrator');

class ContextOrchestrator {
  constructor(agent) {
    this.agent = agent;
    this.planner = new Planner(agent);
  }

  /**
   * Execute multi-tool planning & context aggregation lifecycle
   * @param {string} query
   * @param {object} context - { activeNotePath, userHistory }
   * @param {object} options - { targetConfidence: 0.70, maxIterations: 3 }
   * @returns {Promise<{ evidence: Array, aggregatedContext: string, confidence: number, iterations: number }>}
   */
  async orchestrate(query, context = {}, options = {}) {
    const targetConfidence = options.targetConfidence || 0.70;
    const maxIterations = options.maxIterations || 3;

    // 1. Understand Intent & Build Internal Execution Plan
    const plan = this.planner.createPlan(query);
    log.debug('Internal execution plan generated', { intent: plan.intent, stepsCount: plan.steps.length });

    let collectedEvidence = [];
    let executionTrace = [];
    let iterations = 0;
    let confidence = 0.0;

    // Active workspace tools runner
    const SemanticTools = require('../tools/SemanticTools');

    // 2. Multi-Tool Parallel & Chained Execution Loop
    while (iterations < maxIterations && confidence < targetConfidence) {
      iterations++;
      log.debug(`Executing retrieval iteration ${iterations}/${maxIterations}...`);

      const currentSteps = iterations === 1 ? plan.steps : this._deriveNextSteps(query, collectedEvidence);
      if (currentSteps.length === 0) break;

      // Parallel tool execution for independent tools
      const toolPromises = currentSteps.map(step => {
        return (async () => {
          try {
            const runner = SemanticTools.getToolRunner(step.toolName, this.agent);
            if (runner) {
              const res = await runner(step.args);
              executionTrace.push({
                name: step.toolName,
                args: step.args,
                output: typeof res === 'object' ? JSON.stringify(res).slice(0, 500) : String(res).slice(0, 500)
              });
              return { toolName: step.toolName, result: res, error: null };
            }
          } catch (err) {
            executionTrace.push({
              name: step.toolName,
              args: step.args,
              output: `Error: ${err.message}`
            });
            return { toolName: step.toolName, result: null, error: err.message };
          }
          return null;
        })();
      });

      const results = await Promise.allSettled(toolPromises);

      // Ingest tool results into evidence collection
      for (const item of results) {
        if (item.status === 'fulfilled' && item.value && item.value.result) {
          const rawRes = item.value.result;
          this._ingestEvidence(collectedEvidence, item.value.toolName, rawRes);
        }
      }

      // Proactive WorkspaceBrain & Graph evidence ingestion
      if (this.agent?.workspaceBrain) {
        try {
          const wbFacts = await this.agent.workspaceBrain.getWorkspaceFacts(query, context.activeNotePath);
          executionTrace.push({
            name: 'workspace_graph_retrieval',
            args: { query, activeNotePath: context.activeNotePath || null },
            output: `Retrieved ${wbFacts.length} workspace facts & graph relations`
          });
          for (const fact of wbFacts) {
            collectedEvidence.push({
              source: fact.source || 'WorkspaceBrain',
              filePath: fact.filePath || '',
              content: fact.content || '',
              score: fact.score || 0.8
            });
          }
        } catch { /* ignore fallback */ }
      }

      // 3. Aggregate & Measure Confidence
      const aggregated = this.aggregateContext(collectedEvidence);
      confidence = aggregated.confidence;
      log.debug(`Iteration ${iterations} complete. Measured confidence: ${confidence.toFixed(2)}`);

      if (confidence >= targetConfidence) {
        log.info(`Target confidence ${targetConfidence} achieved in ${iterations} iteration(s).`);
        break;
      }
    }

    // Final consolidation
    const finalAggregated = this.aggregateContext(collectedEvidence);

    return {
      evidence: finalAggregated.items,
      aggregatedContext: finalAggregated.contextString,
      confidence: finalAggregated.confidence,
      iterations,
      trace: executionTrace
    };
  }

  /**
   * Derive subsequent retrieval steps if initial confidence is insufficient
   * @private
   */
  _deriveNextSteps(query, existingEvidence) {
    const steps = [];
    const lowerQuery = String(query).toLowerCase();

    // If existing evidence contains linked notes, trigger graph expansion
    const linkedPaths = existingEvidence
      .map(e => e.filePath)
      .filter(Boolean);

    if (linkedPaths.length > 0) {
      steps.push({
        toolName: 'explore_topic_graph',
        args: { topic: query, notePath: linkedPaths[0], maxHops: 2 }
      });
    } else {
      steps.push({
        toolName: 'find_discussions',
        args: { topic: query }
      });
    }

    return steps;
  }

  /**
   * Ingest raw tool outputs into evidence collection
   * @private
   */
  _ingestEvidence(targetArray, toolName, result) {
    if (typeof result === 'string') {
      targetArray.push({ toolName, content: result, score: 0.75 });
    } else if (Array.isArray(result)) {
      for (const item of result) {
        targetArray.push({
          toolName,
          filePath: item.filePath || item.path || '',
          content: typeof item === 'string' ? item : (item.content || item.snippet || JSON.stringify(item)),
          score: item.score || 0.8
        });
      }
    } else if (typeof result === 'object' && result !== null) {
      targetArray.push({
        toolName,
        filePath: result.filePath || '',
        content: JSON.stringify(result),
        score: 0.7
      });
    }
  }

  /**
   * Aggregate, deduplicate, rank, and calculate evidence confidence
   * @param {Array} evidenceItems
   * @returns {{ items: Array, contextString: string, confidence: number }}
   */
  aggregateContext(evidenceItems) {
    if (!Array.isArray(evidenceItems) || evidenceItems.length === 0) {
      return { items: [], contextString: '', confidence: 0.0 };
    }

    const uniqueMap = new Map();
    for (const item of evidenceItems) {
      const contentStr = String(item.content || '').trim();
      if (!contentStr) continue;

      const key = `${item.filePath || ''}:${contentStr.slice(0, 100)}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    }

    const deduplicated = Array.from(uniqueMap.values());
    deduplicated.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Calculate confidence based on evidence count, relevance scores, and file grounding
    const avgScore = deduplicated.reduce((sum, el) => sum + (el.score || 0.5), 0) / deduplicated.length;
    const groundingBonus = deduplicated.some(el => el.filePath) ? 0.2 : 0.0;
    const volumeBonus = Math.min(deduplicated.length * 0.1, 0.3);
    const confidence = Math.min(1.0, avgScore + groundingBonus + volumeBonus);

    // Format clean curated context string for Reasoning layer
    let contextString = `[CURATED WORKSPACE EVIDENCE payload - ${deduplicated.length} item(s)]\n\n`;
    deduplicated.slice(0, 10).forEach((el, idx) => {
      const fileLabel = el.filePath ? ` [File: ${el.filePath}]` : '';
      contextString += `--- Evidence #${idx + 1}${fileLabel} ---\n${el.content}\n\n`;
    });

    return {
      items: deduplicated,
      contextString,
      confidence
    };
  }
}

module.exports = ContextOrchestrator;
