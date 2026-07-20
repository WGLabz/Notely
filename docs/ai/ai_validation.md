# Notely AI Knowledge Retrieval Validation Report

Validation audit of Retrieval-Augmented Generation (RAG) pipeline in Notely. Analysis of embedding querying, knowledge graph traversal, tool registry, prompt construction, and UI observability.

---

## Findings Summary

| Issue Title | Priority | Target Component / File | Complexity |
| :--- | :--- | :--- | :--- |
| [Knowledge Graph Traversal Fails Silently due to Typo Bug](#1-knowledge-graph-traversal-fails-silently-due-to-typo-bug) | **Critical** | [ai/index.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/index.js) | Low |
| [Current Note Content Blindness in AI Chat and Streaming](#2-current-note-content-blindness-in-ai-chat-and-streaming) | **Critical** | [src/hooks/useAIAssistant.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/src/hooks/useAIAssistant.js) / [ai/core/QueryExecutor.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/core/QueryExecutor.js) | Medium |
| [Related Note Context Discarded as Dead Code](#3-related-note-context-discarded-as-dead-code) | **Critical** | [ai/context/ContextManager.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/context/ContextManager.js) / [ai/core/QueryExecutor.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/core/QueryExecutor.js) | Low |
| [Broken UI Source References Observability](#4-broken-ui-source-references-observability) | **High** | [src/hooks/useAIAssistant.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/src/hooks/useAIAssistant.js) / [ai/core/QueryExecutor.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/core/QueryExecutor.js) | Low |
| [Inefficient In-Memory Cosine Similarity Vector Search](#5-inefficient-in-memory-cosine-similarity-vector-search) | **High** | [ai/context/SemanticRetriever.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/context/SemanticRetriever.js) | High |
| [Absence of Unified Hybrid Retrieval Layer](#6-absence-of-unified-hybrid-retrieval-layer) | **Medium** | [ai/core/QueryExecutor.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/core/QueryExecutor.js) | Medium |
| [No Semantic Chunk Deduplication or Rank Tuning](#7-no-semantic-chunk-deduplication-or-rank-tuning) | **Medium** | [ai/context/SemanticRetriever.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/context/SemanticRetriever.js) | Low |
| [Missing Performance Metrics and Detailed Retrieval Logs](#8-missing-performance-metrics-and-detailed-retrieval-logs) | **Medium** | [ai/context/SemanticRetriever.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/context/SemanticRetriever.js) / [ai/context/GraphRetriever.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/context/GraphRetriever.js) | Low |

---

## Detailed Findings

### 1. Knowledge Graph Traversal Fails Silently due to Typo Bug
* **Priority**: Critical
* **Current Behaviour**: 
  In [ai/index.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/index.js#L115), [GraphRetriever](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/context/GraphRetriever.js) is instantiated with `aiAgent.graphDB ?? aiAgent.databaseManager`.
  On `aiAgent` ([ai/core/Agent.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/core/Agent.js)), these properties do not exist. The correct properties are `graphDb` (lowercase `b`) and `db` (database manager).
  Consequently, `graphRetriever` is instantiated with `undefined`. During execution, `exploreGraph` tool calls trigger `traverse()`, which crashes on `this.graphDB.db` lookup, gets caught by the internal `try-catch`, logs a misleading warning `Graph traversal failed (graph may not be built yet)`, and returns `[]`. No graph context is ever retrieved.
* **Expected Behaviour**: 
  `GraphRetriever` must be constructed using `aiAgent.graphDb`. Traversal CTE query should successfully execute over the SQLite connection.
* **Recommendation**: 
  Change instantiation in [ai/index.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/index.js) to:
  ```javascript
  const graphRetriever = new GraphRetriever(aiAgent.graphDb);
  ```
* **Estimated Complexity**: Low (1 line fix)
* **Dependencies**: None

### 2. Current Note Content Blindness in AI Chat and Streaming
* **Priority**: Critical
* **Current Behaviour**: 
  In [ai/core/QueryExecutor.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/core/QueryExecutor.js#L29), `ContextEngine.buildContext()` is invoked with `activeNoteContent: context.activeNoteContent || null`.
  However, in [useAIAssistant.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/src/hooks/useAIAssistant.js#L415) `aiQueryStream` does not extract or send the editor content in the payload context.
  For non-streaming chat requests, `Agent.query()` calls `ContextManager.buildQueryContext()`, which populates `fileContext` with only a 500-char preview `contentPreview` but omits the full `activeNoteContent` expected by `QueryExecutor`.
  As a result, the `if (activeNotePath && activeNoteContent)` check in [ContextEngine.buildContext()](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/context/ContextEngine.js#L49) fails, and no note content is appended to the system prompt. The LLM is blind to note content during conversations.
* **Expected Behaviour**: 
  The LLM must receive the full active note content (up to the character limit) in the system prompt.
* **Recommendation**: 
  - Update frontend [useAIAssistant.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/src/hooks/useAIAssistant.js) to include the active note's full text content in the IPC query payload as `activeNoteContent`.
  - Ensure the backend retrieves the full note contents from disk using `documentService.getDocumentContent(currentFile)` in `Agent.query` if not supplied by the frontend.
* **Estimated Complexity**: Medium
* **Dependencies**: Typo bug fix in graph instantiation to ensure clean execution.

### 3. Related Note Context Discarded as Dead Code
* **Priority**: Critical
* **Current Behaviour**: 
  [ContextManager.buildQueryContext()](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/context/ContextManager.js#L137) performs keyword-based search over documents to populate `relatedDocuments` array.
  However, this array is completely ignored by `QueryExecutor._prepareConfig()`.
  Furthermore, `ContextManager.buildSystemPrompt()` is dead code (never called). As a result, related notes retrieved via keyword search are discarded and never exposed to the LLM prompt.
* **Expected Behaviour**: 
  Relevant search results and keyword-matched related notes should be injected into the system prompt context or exposed as pre-fetched reference lists.
* **Recommendation**: 
  Inject keyword-matched related documents into the combined workspace context inside `QueryExecutor.js`.
* **Estimated Complexity**: Low
* **Dependencies**: None

### 4. Broken UI Source References Observability
* **Priority**: High
* **Current Behaviour**: 
  In [useAIAssistant.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/src/hooks/useAIAssistant.js#L451), the assistant bubble references list is populated using `finalResult?.references || []`.
  However, the backend `QueryExecutor` execution output returns a `trace` array of tool steps, but no `references` property.
  Additionally, for loaded conversation history in `loadConversation()`, the code maps `references: m.metadata?.trace?.flatMap(t => t.references || [])`. Since the trace objects stored in [MemoryDB](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/memory/MemoryDB.js) only contain `name`, `args`, and `output`, `t.references` is always undefined. Source citations are always empty in the UI.
* **Expected Behaviour**: 
  The frontend should parse the `trace` output of the `searchNotes` tool calls to extract file paths and similarity scores, mapping them to the `references` UI state.
* **Recommendation**: 
  Update [useAIAssistant.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/src/hooks/useAIAssistant.js) to derive references from trace:
  ```javascript
  const references = finalResult?.trace
    ?.filter(t => t.name === 'searchNotes' && Array.isArray(t.output))
    ?.flatMap(t => t.output.map(r => ({ path: r.note_path, relevance: r.score }))) || [];
  ```
  And update conversation history loader to apply similar extraction logic on the saved trace metadata.
* **Estimated Complexity**: Low
* **Dependencies**: None

### 5. Inefficient In-Memory Cosine Similarity Vector Search
* **Priority**: High
* **Current Behaviour**: 
  In [SemanticRetriever.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/context/SemanticRetriever.js#L40), every semantic search query reads all rows from the `chunks` table (including full binary embedding blobs) into JS memory:
  `SELECT id, note_path, embedding FROM chunks WHERE embedding IS NOT NULL`
  The similarity scoring is calculated in a synchronous JS `for` loop. This blocks the single-threaded Node.js event loop during searches on larger vaults.
* **Expected Behaviour**: 
  Embedding databases should utilize indexed databases or fast vectorized query structures (like SQLite vector extensions or native SQLite math/ordering if possible, or batched chunk processing) to avoid pulling all vectors into memory.
* **Recommendation**: 
  Introduce pagination or batch loading for vector rows. Calculate cosine similarity in smaller chunks of records, or explore lightweight vector libraries.
* **Estimated Complexity**: High
* **Dependencies**: None

### 6. Absence of Unified Hybrid Retrieval Layer
* **Priority**: Medium
* **Current Behaviour**: 
  Semantic search (`searchNotes`) and Knowledge Graph traversal (`exploreGraph`) are exposed to the LLM as separate, disconnected tools.
  The application does not perform automated hybrid retrieval. It relies on the LLM to decide which tool to call and sequentially integrate results.
* **Expected Behaviour**: 
  The system should support a unified RAG strategy that automatically executes semantic search, traverses the graph for neighboring entities, merges the results using Reciprocal Rank Fusion (RRF), and feeds a highly ranked context directly into the prompt.
* **Recommendation**: 
  Create a hybrid search orchestrator tool or pre-retrieval pipeline that automatically merges semantic results with graph relations to improve context quality and save LLM reasoning steps.
* **Estimated Complexity**: Medium
* **Dependencies**: Typo bug fix in graph database connection.

### 7. No Semantic Chunk Deduplication or Rank Tuning
* **Priority**: Medium
* **Current Behaviour**: 
  [SemanticRetriever.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/context/SemanticRetriever.js) does not deduplicate overlapping or identical chunks retrieved from the same note.
  The Top-K parameter (`topK`) is set as a default of 5, but there is no vault-wide threshold tuning or token budget constraint applied directly to the retrieval query.
* **Expected Behaviour**: 
  If multiple retrieved chunks belong to the same note, they should be merged or adjacent chunks should be joined. Similarity score thresholds should filter out low-relevance results.
* **Recommendation**: 
  Add a deduplication step post-sorting. Apply a similarity score cutoff threshold (e.g., `score > 0.7`) to drop noisy matches.
* **Estimated Complexity**: Low
* **Dependencies**: None

### 8. Missing Performance Metrics and Detailed Retrieval Logs
* **Priority**: Medium
* **Current Behaviour**: 
  Subsystem loggers do not log performance metrics for retrieval steps. No duration metrics are captured for:
  - Vector generation latency
  - SQLite chunk reading and cosine search duration
  - Graph recursive CTE depth traversal duration
* **Expected Behaviour**: 
  Performance benchmarks and durations should be logged on every query event to enable diagnostics in the developer tool/inspector.
* **Recommendation**: 
  Add high-resolution performance timers (`performance.now()`) inside [SemanticRetriever.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/context/SemanticRetriever.js) and [GraphRetriever.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/context/GraphRetriever.js), and log the durations.
* **Estimated Complexity**: Low
* **Dependencies**: None

---

## Prioritized Implementation Checklist

### Phase 1: Critical Fixes & Data Pipeline Corrections (Urgent)
- [ ] Fix typo in [ai/index.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/index.js) to resolve the `graphRetriever` initialization bug, enabling graph traversal.
- [ ] Update [useAIAssistant.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/src/hooks/useAIAssistant.js) to transmit the full `activeNoteContent` in IPC query payload.
- [ ] Fall back to disk read of note content in backend `Agent.query` when the frontend payload is missing the content.
- [ ] Fix dead code in `QueryExecutor` to append related notes context and restore `ContextManager.buildQueryContext` relevance.

### Phase 2: Observability & Quality Improvements (High Priority)
- [ ] Implement trace-parsing logic in [useAIAssistant.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/src/hooks/useAIAssistant.js) to restore source citations in the chat bubble references.
- [ ] Add post-retrieval semantic deduplication and minimum similarity score threshold in [SemanticRetriever.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/context/SemanticRetriever.js).
- [ ] Add performance duration metrics and detailed event logs for vector search, graph walk, and prompt construction.

### Phase 3: Performance & Hybrid Search Optimization (Medium Priority)
- [ ] Optimize [SemanticRetriever.js](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity Workspace/Notely/ai/context/SemanticRetriever.js) vector search to avoid loading all vector blobs into memory simultaneously (implement batched parsing/calculations).
- [ ] Design and implement a unified hybrid retrieval step merging semantic search and graph connections using Reciprocal Rank Fusion (RRF).
