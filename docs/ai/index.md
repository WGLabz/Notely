---
title: AI Overview
description: Learn about Notely's modular, local-first AI platform.
keywords: ai, local llm, openai, huggingface, vector database, knowledge graph
category: AI
---

# AI Subsystem Overview

Notely features a modular, local-first AI platform designed around private data control. Markdown files remain the absolute source of truth, parsed and indexed into offline-first databases to fuel assistant reasoning.

---

## Capabilities at a Glance

### 1. Global Workspace Chat & Note Assistant
- Chat inside individual notes or launch **Global Chat** from the left panel sidebar on the landing page to query across the entire workspace.
- View referred notes chips under assistant message bubbles so you always know where facts were sourced.

### 2. SQLite Knowledge Graph
- Outbound relations, tags, and CTE traversals mapped into `ai-graph.db`.
- Visualized interactively in the sidebar sidebar.

### 3. Local Embedding Indexer
- High-performance `ai-embeddings.db` storing note chunk vectors.
- Runs entirely offline using a local ONNX runtime for `BGE-small-en-v1.5` embeddings, or falls back to HuggingFace APIs.
- Background Index Worker priority queues processing note changes debounced.

### 4. Custom Persona Registry
- Customize instructions, descriptions, and preset avatar icons (🤖, 💻, 🧠, etc.).
- Import and export personas as Markdown templates.

### 5. Diagnostics & Trace Logs
- Professional **AI Health** panel to verify subsystem initialization.
- Full trace logs displaying exact tool calls, arguments, and return values for all queries.
