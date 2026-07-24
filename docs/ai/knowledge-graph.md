# Knowledge Graph Generation Engine

Notely features an offline, local-first, AI-powered **Knowledge Graph Generation Engine**. It operates without any cloud dependencies, transforming raw Markdown notes into an interconnected Property Graph using local ONNX neural models, SQLite storage, and hybrid GraphRAG retrieval.

---

## Architecture Overview

The system uses a multi-tier pipeline separating document structure parsing from neural semantic understanding.

```mermaid
flowchart TD
    MD[Markdown Note .md] --> AST[Markdown AST Parser]
    AST -->|Structure| EV[Evidence Store SQLite]
    MD --> SEG[Sentence Segmenter Intl.Segmenter]
    
    subgraph Local Neural AI Pipeline
        SEG --> NER[GLiNER Zero-Shot NER ONNX Session]
        NER -->|Entities & Spans| RES[Entity & Alias Resolver]
        RES --> RE[GLiREL Zero-Shot RE ONNX Session]
        RE -->|Scored Relations| EV
    end
    
    EV --> DB[(SQLite Property Graph ai-graph.db)]
    
    subgraph Retrieval & Maintenance
        DB --> CTE[Recursive CTE Graph Walk]
        DB --> MAINT[Background Graph Maintenance]
        CTE --> HYB[Hybrid Retriever RRF]
        HYB --> LLM[LLM Context Builder]
        MAINT --> DB
    end
```

---

## Detailed Pipeline Flow

Processing a Markdown document follows a deterministic, non-blocking pipeline inside an isolated Electron `utilityProcess` worker process.

```mermaid
sequenceDiagram
    autonumber
    participant UI as Electron Renderer
    participant Worker as Background UtilityProcess
    participant AST as Markdown AST Parser
    participant NER as GLiNER Zero-Shot NER (ONNX)
    participant RE as GLiREL Zero-Shot RE (ONNX)
    participant EV as Evidence Store
    participant DB as SQLite GraphDB

    UI->>Worker: Enqueue Note (Path, Content)
    Worker->>AST: Parse Markdown AST Structure
    AST-->>Worker: Return Structural Tokens (Headings, Links, Code)
    Worker->>DB: Upsert Root Note & Structural Entities
    Worker->>EV: Register Baseline Structural Evidence
    
    Worker->>NER: Segment Sentences & Classify Tokens (Pass 1)
    NER-->>Worker: Return Extracted Entities & Character Spans
    
    Worker->>RE: Neural Pair Scoring across Co-occurring Entities (Pass 2)
    RE-->>Worker: Return Relations & Confidence Scores
    
    Worker->>EV: Insert Neural Provenance Records
    Worker->>DB: Upsert Generic Entities & Relationship Edges
    Worker-->>UI: Broadcast IPC Progress (ai:graph:progress)
```

---

## Key Components & Concepts

### 1. Markdown AST Parser (Structure & Metadata)

The structural parser converts raw Markdown text into a structural AST tree without imposing domain semantics.

- **Root Note Entity**: Uniquely identifies the document by path hash.
- **Frontmatter & Header Key-Value Metadata**: Automatically extracts YAML block frontmatter and top key-value lines (`Tags:`, `Name:`, `Location:`, `Time:`):
  - `Tags:` / `- tag` $\rightarrow$ Generates `#tag` (`Tag`) nodes linked to Note.
  - `Name: Person A, Person B` $\rightarrow$ Generates `Person` entities linked via `has_person`.
  - `Location: City` $\rightarrow$ Generates `Location` entities linked via `located_in`.
  - `Time: DateRange` $\rightarrow$ Preserved in `Note.properties.metadata`.
- **Wikilinks (`[[Target]]`)**: Links documents to target notes with bidirectional edge weights.
- **Section Headings (`# Heading`)**: Captures document hierarchy (`contains_section`) with level-attenuated weights ($H_1 = 1.4, H_2 = 1.3, \dots, H_6 = 0.9$). Built-in Notely system sections (`# RawNotes`, `# Cleansed`) are automatically excluded from becoming section nodes.
- **Tags (`#tag`)**: Categorizes concepts (`tagged`).
- **Code Blocks & Snippets**: Identifies code snippets and languages (`contains_code`, `references_code`).
- **Tasks (`- [ ]`, `- [x]`)**: Extracts open (`has_open_task`) and completed (`has_completed_task`) task items.
- **Callouts & Math Formulas**: Preserves structural metadata for callout blocks and math syntax ($math$).

> [!TIP] **Global Single-Node Deduplication**
> Entities and structural nodes (e.g. `CodeBlock: JS`, `Tag: #research`, AI-extracted entities) use deterministic SHA-256 ID resolution. If **Note A** and **Note B** both reference `JS`, the engine creates **only one single global block/node** for `JS`, linking both notes to that shared node as hubs in the graph network.

---

### 2. Specialist Neural Extraction Pipeline

Semantic extraction uses two offline ONNX models (~70MB each) executing via local ONNX runtime (`onnxruntime-node`).

```mermaid
graph LR
    subgraph Pass 1: GLiNER NER
        A[Raw Sentence] --> B[GLiNER ONNX Session]
        B --> C[Zero-Shot Entity Spans & Scores]
    end
    
    subgraph Pass 2: GLiREL RE
        C --> D[Co-occurring Entity Pair Matrix]
        D --> E[GLiREL ONNX Session]
        E --> F[Typed Relationships & Confidence]
    end
```

1. **Pass 1 — Named Entity Recognition (NER)**:
   Segments document using `Intl.Segmenter` and runs zero-shot GLiNER ONNX session to locate entities with confidence scores $\ge 0.50$. Dynamically maps candidates to standard entity categories (`Person`, `Organization`, `Technology`, `Location`, `Concept`, `Product`, `Event`, `Document`, `Diagram`, `Task`) without hardcoded taxonomies or word lists, preserving complete domain independence across engineering, medicine, finance, and law.
2. **Pass 2 — Relation Extraction (RE)**:
   Evaluates co-occurring entity pairs within sentence windows, running zero-shot GLiREL ONNX relation classification tensors to score edge connection strength (`depends_on`, `uses`, `created_by`, `contains`, `is_a`, `related_to`).

---

### 3. SQLite Property Graph & Evidence Store

Knowledge graph data is stored locally in `.notes-app/ai-graph.db` using native SQLite (`node:sqlite`) with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`).

```mermaid
erDiagram
    entities ||--o{ relationships : "source_id"
    entities ||--o{ relationships : "target_id"
    entities ||--o{ entity_aliases : "entity_id"
    evidence ||--o{ relationships : "evidence_id"
    
    entities {
        string id PK
        string name
        string canonical_name
        string type
        string note_path
        json properties
        datetime created_at
    }
    
    relationships {
        int id PK
        string source_id FK
        string target_id FK
        string type
        real weight
        real confidence
        json metadata
        string evidence_id FK
    }
    
    evidence {
        string id PK
        string source_id
        string extractor
        string subject_text
        int subject_span_start
        int subject_span_end
        string predicate_text
        string object_text
        string raw_sentence
        real confidence
    }
```

- **Deterministic Entities**: Entity IDs are generated deterministically using SHA-256 (`ent-` + sha256 of type:normalizedName).
- **Evidence & Provenance**: Every AI-discovered relationship links to an `evidence` record preserving exact source offsets, raw sentence text, extractor identity, and confidence score.

---

### 4. Entity Resolution & Canonicalization

Entity names and variations are resolved using a hybrid distance calculation:

$$\text{Similarity}(s_1, s_2) = \max\left( \text{LevenshteinSim}(s_1, s_2), \text{JaccardTokenSim}(s_1, s_2) \right)$$

Candidate matches above threshold $\ge 0.88$ are automatically mapped in `entity_aliases` table without mutating source entity IDs.

---

### 5. Hybrid GraphRAG & RRF Retrieval

Retrieval combines semantic vector search with recursive GraphRAG multi-hop walks using **Reciprocal Rank Fusion (RRF)**:

```mermaid
graph TD
    UserQuery[User Query] --> VecSearch[Vector Embedding Search]
    UserQuery --> GraphWalk[Recursive CTE Graph Walk]
    
    VecSearch -->|Semantic Ranks| RRF[Reciprocal Rank Fusion Engine]
    GraphWalk -->|Decayed Depth & Edge Weights| RRF
    
    RRF -->|Ranked Document List| Context[LLM Context Builder]
```

$$\text{RRF\_Score}(d) = \frac{1}{k + \text{Rank}_{\text{vector}}(d)} + \frac{1 + \alpha \cdot W_{\text{graph}}(d)}{k + \text{Rank}_{\text{graph}}(d)}$$

Where:
- $k = 60$ (standard RRF constant)
- $\alpha = 0.25$ (graph weight bonus multiplier)
- $W_{\text{graph}}(d)$ is the accumulated edge weight with depth decay ($1 / (1 + \text{depth})$)

---

### 6. Self-Healing Background Maintenance

When the background job queue drains, `GraphMaintenance` runs incremental cleanup tasks:

1. **Orphan Purging**: Deletes orphan non-note entities with zero connections.
2. **Stale Edge Decay**: Applies decay factor ($W \times 0.95$) to relationships older than 30 days.
3. **Alias Deduplication**: Merges candidate duplicate entity mentions using hybrid string similarity.
