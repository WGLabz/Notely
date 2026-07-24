import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import PromptLoader from '../../ai/prompts/PromptLoader';
import TemplateEngine from '../../ai/prompts/TemplateEngine';
import PromptPipeline from '../../ai/prompts/PromptPipeline';
import PersonaManager from '../../ai/personas/PersonaManager';
import PromptTester from '../../ai/testing/PromptTester';
import PromptLibrary from '../../ai/core/PromptLibrary';

describe('Prompt Architecture Infrastructure', () => {
  let loader;
  let pipeline;
  let personaManager;
  let tester;

  beforeEach(() => {
    loader = new PromptLoader();
    pipeline = new PromptPipeline(loader);
    personaManager = new PersonaManager(loader);
    tester = new PromptTester(loader);
  });

  describe('PromptLoader', () => {
    it('loads and parses frontmatter from base-system.md', () => {
      const prompt = loader.loadSystemPrompt('base-system');
      expect(prompt.id).toBe('base-system');
      expect(prompt.metadata.version).toBe('1.0.0');
      expect(prompt.body).toContain("Notely's AI Knowledge Partner");
    });

    it('loads and parses built-in persona software-engineer', () => {
      const persona = loader.loadPersona('software-engineer');
      expect(persona.id).toBe('software-engineer');
      expect(persona.metadata.name).toBe('Software Engineer');
      expect(persona.metadata.tone).toContain('analytical');
      expect(persona.body).toContain('senior pair programmer');
    });

    it('loads dynamic templates', () => {
      const wsTemplate = loader.loadTemplate('workspace-context');
      expect(wsTemplate).toContain('{{workspaceRoot}}');
      expect(wsTemplate).toContain('{{activeNotePath}}');
    });

    it('caches loaded prompts and supports clearing cache', () => {
      const p1 = loader.loadSystemPrompt('grounding-policy');
      const p2 = loader.loadSystemPrompt('grounding-policy');
      expect(p1).toBe(p2);

      loader.clearCache();
      const p3 = loader.loadSystemPrompt('grounding-policy');
      expect(p3).not.toBe(p1);
      expect(p3.id).toBe('grounding-policy');
    });
  });

  describe('TemplateEngine', () => {
    it('renders workspace context with variable substitution', () => {
      const template = 'Root: {{workspaceRoot}}, File: {{activeNotePath}}';
      const rendered = TemplateEngine.render(template, {
        workspaceRoot: '/my/notes',
        activeNotePath: 'readme.md'
      });
      expect(rendered).toBe('Root: /my/notes, File: readme.md');
    });

    it('renders retrieved evidence arrays', () => {
      const template = 'Evidence:\n{{retrievedEvidence}}';
      const evidence = ['Fact 1 from note A', 'Fact 2 from note B'];
      const rendered = TemplateEngine.renderRetrievedContext(template, evidence);
      expect(rendered).toContain('Fact 1 from note A');
      expect(rendered).toContain('Fact 2 from note B');
    });

    it('renders UI context with active tab and view mode', () => {
      const template = loader.loadTemplate('ui-context');
      const rendered = TemplateEngine.renderUIContext(template, {
        activeTab: 'preview',
        selectedText: 'selected highlight text',
        uiViewMode: 'split'
      });
      expect(rendered).toContain('preview');
      expect(rendered).toContain('selected highlight text');
    });
  });

  describe('PromptPipeline & Assembly', () => {
    it('assembles complete 13-stage system prompt', () => {
      const assembled = pipeline.assemble({
        persona: 'technical-architect',
        workspaceContext: {
          workspaceRoot: '/workspace/notely',
          activeNotePath: 'architecture.md',
          activeNoteContent: '# System Architecture Note',
          documentCount: 42
        },
        retrievedEvidence: 'Graph traversal shows 5 related notes.',
        uiContext: { activeTab: 'graph-view' }
      });

      expect(assembled).toContain("Notely's AI Knowledge Partner");
      expect(assembled).toContain('Behavior & Communication Policy');
      expect(assembled).toContain('Permission & Mutability Policy');
      expect(assembled).toContain('Grounding & Truthfulness Policy');
      expect(assembled).toContain('Technical Architect');
      expect(assembled).toContain('/workspace/notely');
      expect(assembled).toContain('Graph traversal shows 5 related notes.');
    });

    it('preserves read-only invariants regardless of persona', () => {
      const assembled = pipeline.assemble({ persona: 'brainstorming' });
      expect(assembled).toContain('READ-ONLY');
      expect(assembled).toContain('Zero Fabrication');
    });
  });

  describe('PersonaManager', () => {
    it('lists all 9 built-in persona IDs', () => {
      const list = personaManager.listAvailablePersonas();
      expect(list.length).toBeGreaterThanOrEqual(9);
      expect(list).toContain('software-engineer');
      expect(list).toContain('knowledge-librarian');
    });

    it('retrieves and normalizes persona objects', () => {
      const persona = personaManager.getPersona('research-assistant');
      expect(persona.name).toBe('Research Assistant');
      expect(persona.systemInstructions).toContain('rigorous research assistant');
    });

    it('creates deterministic custom user personas formatted via standard Markdown template', () => {
      const customData = {
        name: 'Product Manager',
        description: 'Focuses on user stories and specs.',
        tone: 'strategic, clear',
        systemInstructions: 'Prioritize product roadmap and user requirements.'
      };

      const persona = personaManager.createCustomPersona(customData);
      expect(persona.id).toBe('product-manager');
      expect(persona.name).toBe('Product Manager');
      expect(persona.systemInstructions).toBe('Prioritize product roadmap and user requirements.');

      const retrieved = personaManager.getPersona('product-manager');
      expect(retrieved.id).toBe('product-manager');
      expect(retrieved.tone).toBe('strategic, clear');
    });
  });

  describe('PromptTester', () => {
    it('passes full automated audit on all policies and personas', () => {
      const audit = tester.runFullAudit();
      expect(audit.success).toBe(true);
      expect(audit.results.policyLint.valid).toBe(true);
      expect(audit.results.personaLint.valid).toBe(true);
      expect(audit.results.invariantCheck.valid).toBe(true);
    });

    it('detects safety invariant violations if safeguards are missing', () => {
      const check = tester.validateSafetyInvariants('Empty prompt without rules');
      expect(check.valid).toBe(false);
      expect(check.errors.length).toBeGreaterThan(0);
    });
  });

  describe('PromptLibrary Facade', () => {
    it('returns base system prompt via loader', () => {
      const base = PromptLibrary.getBaseSystemPrompt();
      expect(base).toContain("Notely's AI Knowledge Partner");
    });

    it('composes system prompt via pipeline', () => {
      const composed = PromptLibrary.composeSystemPrompt('Custom role text', 'Workspace context string');
      expect(composed).toContain("Notely's AI Knowledge Partner");
      expect(composed).toContain('Custom role text');
    });
  });
});
