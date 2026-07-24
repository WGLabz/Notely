# Static Prompt Schema Specification

All static system policy files in Notely AI must be stored as Markdown files in `resources/prompts/system/` with frontmatter metadata.

## Frontmatter Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique policy identifier (e.g., `grounding-policy`) |
| `version` | string | Yes | SemVer prompt version (e.g., `1.0.0`) |
| `name` | string | Yes | Human-readable prompt layer title |
| `description` | string | Yes | Brief description of policy responsibility |
| `layer` | string | Yes | System assembly layer (`system`, `policy`, `formatting`, `safety`) |
| `owner` | string | Yes | Maintainer owner |
| `schemaVersion` | string | Yes | Target schema version (`1.0.0`) |
| `dependencies` | array | No | List of prerequisite prompt IDs required before loading |

## Schema Rules

1. Single Responsibility: Each static prompt file governs exactly one policy aspect (identity, permissions, grounding, formatting, safety, planning, etc.).
2. Zero Runtime Strings: No hardcoded dynamic workspace variables, note contents, or dates inside static prompt files. Dynamic values must use `.template` assets.
3. Provider & Tool Agnostic: Prompts must remain vendor-neutral (works identically across OpenAI, Gemini, Groq, local ONNX models).
