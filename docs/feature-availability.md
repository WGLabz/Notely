# Feature Availability

This page helps you decide what works offline, what needs optional setup, and what depends on external services.

## Core Feature Matrix

| Feature | Available by default | Needs setup | Internet required |
|---|---|---|---|
| Notes create/edit | Yes | No | No |
| Folder organization | Yes | No | No |
| Edit/Split/Preview modes | Yes | No | No |
| Markdown validation | Yes | No | No |
| Typo checking | Yes | No | No |
| Global search | Yes | No | No |
| Version history | Yes | No | No |
| Media insert/manage | Yes | No | No |
| Mermaid diagrams | Yes | No | No |
| Excalidraw diagrams | Yes | No | No |
| Workspace graph | Yes | No | No |
| Semantic graph clusters | No | Embeddings setup | Usually yes |
| Workspace Health media checks | Yes | No | No |
| Image annotation overlays | Yes | No | No |
| Original image restore | Yes | No | No |
| PDF export | Yes | No | No |
| Website-style preview/export rendering | Yes | No | No |
| P2P sync | No | Pair trusted peers | Usually local network |
| AI chat | No | API key/provider setup | Yes |
| AI palette actions | No | API key/provider setup | Yes |
| Semantic search | No | Embeddings provider/token | Yes |
| Pattern detection | No | AI provider setup | Usually yes |

## Setup-Dependent Features

### P2P Sync

Needs trust pairing with peers from **P2P -> P2P Status**.

### AI Features

Need provider configuration in **AI -> AI Settings**.

- AI Chat: provider API key
- AI palette actions: provider API key
- Semantic search: embeddings provider/token
- Pattern features: supported AI provider

### Semantic Graph Features

Graph clustering and freshness indicators depend on embedding generation and cache freshness.

## Practical Guidance

- If you work fully offline, core note authoring features are fully available.
- If you collaborate across devices, configure P2P sync.
- If you need semantic and AI features, complete AI setup first.
