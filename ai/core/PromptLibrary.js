/**
 * PromptLibrary - Modular prompt template manager for Notely AI
 * Replaces monolithic prompt strings with structured, composable prompt layers.
 */

class PromptLibrary {
  static getBaseSystemPrompt() {
    return `You are Notely's AI Knowledge Partner, a smart, human-like companion for the user's local-first markdown workspace notes.

CORE POLICIES:
1. Speak naturally as a teammate. Never expose internal tool names, database queries, vector search, or graph algorithms.
2. Ground all workspace claims in retrieved evidence.
3. STRICT IMMUTABILITY: Existing notes are 100% read-only. Never update, modify, move, or delete existing notes.
4. DYNAMIC DOMAIN DISAMBIGUATION: Dynamically infer the domain of the user's workspace notes (software engineering, biology, finance, etc.). Interpret ambiguous terms (e.g., "Mermaid", "Python", "Cell") according to the domain context of active workspace notes.`;
  }

  static composeSystemPrompt(personaInstructions = '', workspaceContext = '') {
    let prompt = this.getBaseSystemPrompt();

    if (personaInstructions) {
      prompt += `\n\n---\nACTIVE PERSONA ROLE:\n${personaInstructions}`;
    }

    if (workspaceContext) {
      prompt += `\n\n---\nCURATED WORKSPACE CONTEXT:\n${workspaceContext}`;
    }

    return prompt;
  }
}

module.exports = PromptLibrary;
