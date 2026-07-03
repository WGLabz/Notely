# AI Module Reference

This file summarizes the main developer-facing integration points for Notely's AI system.

## Core modules

- `core/` orchestration, context, pattern learning, and graph analysis
- `llm/` provider abstractions and provider registry
- `services/` embeddings, document retrieval, relationships, and query execution
- `database/` SQLite-backed persistence and migrations
- `utils/` protocol and configuration helpers

## Renderer integration

Primary UI surfaces:

- `src/components/AIPalette.jsx`
- `src/components/AIChatPanel.jsx`
- `src/components/AISettings.jsx`

Renderer service bridge:

- `src/services/electronService.js`

## Main-process integration

Primary handlers:

- `electron/ai/aiHandlers.cjs`

AI configuration storage:

- API keys: Electron `safeStorage`, configured through AI settings UI
- Local AI metadata: `.notes-app/app.sqlite`
- Windows user-level config path visible in UI: `%APPDATA%/Notely/ai-config.json`

## Provider status

Currently configurable in the UI:

- Gemini
- Groq
- HuggingFace embeddings token

Visible but not currently available in the UI:

- OpenAI
- Local LLM

## Main user-invoked operations

- Generate embeddings
- Build relationship graph
- Detect patterns
- Clear AI data
- Run chat and palette prompts

## Notes for maintainers

- Keep UI provider lists, capability warnings, and README claims aligned.
- When adding a provider, update the provider registry, AI settings UI, and end-user documentation together.