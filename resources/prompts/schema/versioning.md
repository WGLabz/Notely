# Prompt Versioning Policy

Notely AI prompts use Semantic Versioning (MAJOR.MINOR.PATCH):

## Versioning Rules

- **MAJOR (x.0.0)**: Breaking changes in prompt structure, removal of system policies, or fundamental changes to safety/permission invariants.
- **MINOR (1.x.0)**: Addition of new policy layers, optional persona parameters, or new formatting rules that retain backward compatibility.
- **PATCH (1.0.x)**: Minor phrasing improvements, typo fixes, clarification tweaks, or non-functional tone adjustments.

## Dependency & Compatibility Resolution

- Every prompt file specifies `schemaVersion`. `PromptLoader` rejects prompt assets if `schemaVersion` is incompatible with current application runtime.
- Breaking changes require updating the `breakingChanges` frontmatter log.
