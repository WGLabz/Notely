# Persona Schema Specification

Every persona definition in Notely AI must be authored as a versioned Markdown file under `resources/prompts/personas/` containing YAML frontmatter metadata followed by body sections.

## Frontmatter Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique identifier (kebab-case, e.g. `software-engineer`) |
| `name` | string | Yes | Human-readable display name |
| `version` | string | Yes | SemVer version string (e.g. `1.0.0`) |
| `description` | string | Yes | Brief description of persona focus |
| `purpose` | string | Yes | High-level purpose statement |
| `expertise` | array | Yes | Key domains of expertise |
| `tone` | string | Yes | Communication tone adjectives |
| `verbosity` | string | Yes | Response length preference (`concise`, `balanced`, `detailed`, `thorough`) |
| `responseStructure` | string | Yes | High-level outline structure for answers |
| `owner` | string | Yes | Team or author responsible |
| `schemaVersion` | string | Yes | Compatible persona schema version (e.g. `1.0.0`) |

## Body Requirements

The persona body must contain instructions governing:
1. Role Definition & Mindset
2. Communication Style & Tone
3. Reasoning & Analysis Style
4. Response Formatting & Structure Expectations
5. Clarification Strategy
6. Example Interactions & Preferred Scenarios
7. Fallback Behavior

## Invariants (Enforced by PromptPipeline & PromptTester)

Personas MUST NEVER:
- Modify workspace permissions (read-only existing notes invariant stays strictly enforced).
- Override evidence grounding or permit hallucinating note titles.
- Disable safety policies or alter system tool availability.
- Narrate internal tool mechanics or expose database execution details.
