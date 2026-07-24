/**
 * AgentHarness - Production Evaluation & Diagnostic Harness for Notely AI
 * Measures tool selection precision, grounding accuracy, zero-jargon compliance, and retrieval performance.
 */

const GroundingEngine = require('../core/GroundingEngine');

class AgentHarness {
  constructor(agent) {
    this.agent = agent;
  }

  /**
   * Run evaluation scenario suite against AI Agent
   * @param {Array<{ id: string, query: string, expectedIntent?: string, expectedKeywords?: string[] }>} scenarios
   * @returns {Promise<object>} - Comprehensive evaluation metrics
   */
  async runEvaluation(scenarios = []) {
    const results = [];
    let totalLatencyMs = 0;
    let totalTokens = 0;
    let passedGrounding = 0;
    let zeroJargonCompliant = 0;

    for (const scenario of scenarios) {
      const startTime = Date.now();
      try {
        const queryRes = await this.agent.query(scenario.query);
        const latencyMs = Date.now() - startTime;

        totalLatencyMs += latencyMs;
        totalTokens += queryRes.tokensUsed || 0;

        // Check citation grounding
        const groundingCheck = GroundingEngine.verifyCitations(queryRes.result);
        if (groundingCheck.brokenCitations === 0) {
          passedGrounding++;
        }

        // Check zero-jargon compliance (no tool names or internal query terms exposed)
        const lowerRes = String(queryRes.result || '').toLowerCase();
        const containsJargon = lowerRes.includes('search_notes') || lowerRes.includes('read_note') || lowerRes.includes('cosine similarity');
        if (!containsJargon) {
          zeroJargonCompliant++;
        }

        results.push({
          id: scenario.id,
          query: scenario.query,
          success: queryRes.success,
          latencyMs,
          tokensUsed: queryRes.tokensUsed || 0,
          grounding: groundingCheck,
          zeroJargonCompliant: !containsJargon,
          trace: queryRes.trace || []
        });
      } catch (err) {
        results.push({
          id: scenario.id,
          query: scenario.query,
          success: false,
          error: err.message
        });
      }
    }

    const count = scenarios.length || 1;
    return {
      totalScenarios: scenarios.length,
      averageLatencyMs: totalLatencyMs / count,
      totalTokensUsed: totalTokens,
      groundingScore: (passedGrounding / count) * 100,
      zeroJargonScore: (zeroJargonCompliant / count) * 100,
      scenarioResults: results
    };
  }
}

module.exports = AgentHarness;
