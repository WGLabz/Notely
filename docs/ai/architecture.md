---
title: AI Architecture
description: Deep dive into Notely's offline-first AI and vector search architecture.
keywords: AI architecture, vector embeddings, graph DB, SQLite, CTE, cosine similarity
category: AI
---

# AI Subsystem Architecture

Notely implements a local-first, offline-ready AI architecture designed for privacy and low latency. This document outlines the internals of the embedding indexer, the knowledge graph, and the query execution lifecycle.

---

# AI Subsystem Architecture

Notely implements a local-first, offline-ready AI architecture designed for privacy and low latency. This document outlines the internals of the embedding indexer, the knowledge graph, and the query execution lifecycle.

---

## Architecture Blueprint

The following diagram shows the full request path from UI through each layer to storage.

```mermaid
flowchart TD
    subgraph Renderer["Renderer Process (React / Vite)"]
        direction LR
        ACP["AIChatPanel"] & AIS["AISettings"] & EBP["EmbeddingsPage"] & KGV["KnowledgeGraph"]
        UAI["useAIAssistant hook"]
    end

    subgraph Preload["Preload Bridge (preload.cjs)"]
        CB["window.electronAPI.ai.*"]
    end

    subgraph Handlers["AI IPC Handlers — aiHandlers.cjs"]
        TRUST["Trusted Sender Guard"]
        CHAN["55+ ipcMain.handle channels"]
    end

    subgraph AIService["AI Service — AIService.js (Singleton)"]
        SW["Master Enable / Disable Switch"]
        HOOKS["Note Save · Delete · Rename Hooks"]
    end

    subgraph Agent["Agent Orchestrator — Agent.js"]
        direction LR
        LR["LLMRegistry"] & ES["EmbeddingService"] & GS["GraphService"] & CE["ContextEngine"] & QE["QueryExecutor"]
        GP["graphProvider"] & LMM["localModelManager"]
    end

    subgraph Providers["Inference Providers"]
        direction LR
        GEM["GeminiProvider"] & GRQ["GroqProvider"] & OAI["OpenAICompatibleProvider"] & LLP["LocalLlamaProvider (Qwen2.5)"]
        HFEP["HuggingFaceEmbeddingProvider"] & ONNXE["ONNXEmbedder (BGE-small)"]
    end

    subgraph Retrieval["Context Assembly"]
        direction LR
        SR["SemanticRetriever"] & GR["GraphRetriever"] & HR["HybridRetriever (RRF)"]
    end

    subgraph Storage["SQLite Storage — WAL Mode"]
        direction LR
        EMBDB[("ai-embeddings.db")] & GRDB[("ai-graph.db")] & MEMDB[("memory.db / personas.db")]
    end

    Renderer -->|"IPC · contextBridge"| Preload
    Preload -->|"ipcMain.handle"| Handlers
    Handlers --> AIService
    AIService --> Agent

    LR --> GEM & GRQ & OAI & LLP
    ES --> HFEP & ONNXE

    CE --> SR & GR
    HR --> SR & GR

    ES --> EMBDB
    GS --> GRDB
    CE --> MEMDB
```

---

## 1. Local GGUF Engine & Shared Model Manager

To support robust local text generation and offline knowledge graph relationship extraction on consumer hardware, Notely implements a local GGUF execution engine:

* **`LocalModelManager`**: Manages a single shared runtime instance of the `Qwen2.5-0.5B-Instruct` model in GGUF format via `node-llama-cpp`. This manager prevents GPU/RAM duplication by sharing the loaded model instance between the Local Chat Provider (`LocalLlamaProvider`) and the Local Graph Extraction Provider (`LocalGraphProvider`).
* **`LocalLlamaProvider`**: Integrates with the `LLMRegistry` to process user chat prompts completely offline without sending data to external cloud APIs.
* **`LocalGraphProvider`**: Executes custom schema-based relationship extractions to build graph databases directly on-device.

---

## 2. Vector Embeddings Engine

Instead of utilizing heavy native SQLite vector extensions (which introduce cross-compilation complexity in Electron apps), Notely implements a high-performance hybrid pipeline:

### Storage Schema
Embeddings are stored in `{workspace}/.notes-app/ai-embeddings.db` using standard SQLite tables:
* **`chunks`**: Text blocks, file paths, line numbers, hashes, and embedding vectors (saved as standard binary `BLOB` fields).
* **`note_hashes`**: Track files to identify updates/deletions.
* **`indexing_queue`**: Background pipeline jobs.

### Dimension Guard
* **Physical Dimension Validation**: The database tracks active vectors and vector byte length. The system runs `verifyModelDimensions(activeModelName)` on boot and worker startup, validating stored vector byte sizes (384 float32s = 1536 bytes) rather than comparing string model names. This prevents false model mismatch wipes while safely clearing data if vector sizes physically change.

---

## 3. Centralized Multitenant Logging (`LogDB.js`)

All AI and system subsystem activities are logged to the central logging database at `{workspace}/.notes-app/ai-logs.db`. For complete application-wide logging architecture, see [Application Architecture](/architecture).

### Extraction & Query Process
1. **Model Execution**: A local ONNX session (via `onnxruntime-node` or `onnxruntime-web`) executes `BGE-small-en-v1.5` to generate 384-dimensional vectors. Alternatively, the cloud HuggingFace Inference API (`sentence-transformers/all-MiniLM-L6-v2`) is used.
2. **Tokenizer Fallback**: If the ONNX runtime is missing, the system utilizes a robust pre-tokenization pattern (`/[a-z0-9]+|[^\s\w]/gi`) in `ONNXEmbedder.js` to preserve punctuation, formatting marks, and mathematical symbols as individual tokens instead of stripping them.
3. **Batch Retrieval & Cosine JS**: During a semantic search query, the `SemanticRetriever` pulls chunk vector `BLOB`s in batches (default: 500) from the SQLite database and performs standard binary buffer deserialization into Javascript `Float32Array` collections. The similarity calculation is run using a fast in-memory Javascript cosine similarity loop.
4. **Keyword Fallback**: If the local embedding provider is uninitialized or vector generation fails, `SemanticRetriever` falls back to a plain-text SQL `LIKE` query (`searchTextFallback`) against the chunk content.
5. **Filtering**: Matches are filtered using a threshold ($\ge 0.70$), sorted, and deduplicated. Note contents are only loaded from the database for the top-scoring matches.

---

## 4. Knowledge Graph Subsystem

Notely maps relationships between note documents inside `{workspace}/.notes-app/ai-graph.db`.

### Graph Structure
* **`entities`**: Nodes representing markdown notes, tags, people (`@mentions`), and specific concepts. The note's entity ID is derived directly from slugifying its filename (e.g. `AI and Search.md` -> `ai-and-search`).
* **`relationships`**: Directed edges (`source_id` $\rightarrow$ `target_id`) representing links, mentions, or thematic clusters.

### Synchronization & Deletion
* **Entity Cleanup**: When a note is deleted, `AIService` triggers `deleteNoteEntityAndRelationships(notePath)` in `GraphDB.js`. This runs a transaction to synchronously purge all incoming/outgoing edges (`source_id` or `target_id` matching the slugified `entityId`) and the note's entity node itself, avoiding orphaned nodes and stale link suggestions.

### Graph Traversals via Recursive CTEs
Because the graph database is backed by standard SQLite, relation traversals and pathfinding are performed using native **Recursive Common Table Expressions (CTEs)**. This removes the need for custom graph query engines:

#### Depth-First Neighbor Search
To discover associated nodes up to depth $N$:
```sql
WITH RECURSIVE connected(id, depth) AS (
  SELECT ? as id, 0 as depth
  UNION
  SELECT r.target_id, c.depth + 1
  FROM relationships r JOIN connected c ON r.source_id = c.id
  WHERE c.depth < ?
  UNION
  SELECT r.source_id, c.depth + 1
  FROM relationships r JOIN connected c ON r.target_id = c.id
  WHERE c.depth < ?
)
SELECT DISTINCT e.*, c.depth 
FROM entities e 
JOIN connected c ON e.id = c.id;
```

#### Pathfinding
To find the shortest link path between two notes:
```sql
WITH RECURSIVE paths(id, path_str, depth) AS (
  SELECT ? as id, ? as path_str, 0 as depth
  UNION ALL
  SELECT r.target_id, p.path_str || ',' || r.target_id, p.depth + 1
  FROM relationships r JOIN paths p ON r.source_id = p.id
  WHERE p.depth < ? AND p.path_str NOT LIKE '%' || r.target_id || '%'
)
SELECT path_str FROM paths WHERE id = ? ORDER BY depth ASC LIMIT 1;
```

---

## 3. Query Execution Lifecycle

When you ask a question to the Notely AI Agent:

1. **Context Construction**: `ContextEngine` fetches conversational history, the active note's contents, semantic chunks via `SemanticRetriever`, and neighbors via `GraphRetriever`.
2. **Tool Loading**: The system reads available tools from the `ToolRegistry`, including:
   * Core Note Operations: `read_note` (capped to 10,000 characters with `start_line` and `end_line` pagination parameters), `list_notes`, `search_notes`.
   * Advanced Operations: `resolve_folder_link` (resolves relative subdirectory paths), `read_pdf` (plain text extractor via `pdfjs-dist`).
   * Version Control: `git_diff` and `git_commit` (inspect unstaged changes and commit them).
3. **SDK Routing**: The request is dispatched to the active provider (Gemini, Groq, or OpenAI compatible) using the **Vercel AI SDK** with `maxSteps: 5`.
4. **Execution Loop**: The LLM executes tool calls if needed, receives feedback, and returns a natural language response.
5. **Memory Record**: The prompt, response, tokens used, and tool trace are saved to the history database.
