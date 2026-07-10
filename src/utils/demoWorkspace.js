import { createDocument, saveDocument, createFolder } from "../services/electronService";

export async function setupDemoWorkspace(workspacePath) {
  try {
    // 1. Landing page note (root)
    const overviewDoc = await createDocument("Notely Overview", workspacePath);
    await saveDocument({
      filePath: overviewDoc.filePath,
      header: "Name: Notely Overview\nTags: overview, root\nLocation: Local Workspace\nTime: 09:00, 10 Jul 2026 to 10:30, 10 Jul 2026\n",
      rawNotes: `# Notely App Overview

Welcome to the Notely app! Notely is an advanced local-first desktop application built with Electron and React, designed specifically for team collaboration and project document management. It merges traditional Markdown files with rich features like interactive diagrams, local AI search, and secure serverless sync.

### Architecture Overview

Notely operates on a hardened multi-process architecture to separate core operating system privileges from user-interface rendering:

\`\`\`mermaid
graph TD
    subgraph "Electron Main Process"
        M[Main Controller] -->|File System Ops| FS[Disk Storage]
        M -->|Metadata Store| DB[(SQLite/JSON Store)]
        M -->|P2P Engine| P2P[P2P Live Service]
    end

    subgraph "Preload Context Bridge"
        PCB[preload.cjs - Secure API Gateway]
    end

    subgraph "Renderer Process"
        R[React UI App] -->|CodeMirror 6| E[Editor Component]
        R -->|Markdown-It| P[Preview Component]
    end

    E -->|IPC Invocation| PCB
    P -->|IPC Invocation| PCB
    PCB -->|Bridge IPC| M
\`\`\`

### In-Depth Core Philosophy

Notely is built on a few unyielding principles:
1. **Local-First Ownership**: Your files are stored as plain text Markdown on your hard drive. No proprietary database formatting, no vendor lock-in. If you uninstall Notely, your notes remain yours.
2. **Security & Sandboxing**: The embedded terminal and IPC channels are heavily audited. Renderer contexts are isolated, and Node integration is disabled to prevent arbitrary execution vectors.
3. **Decentralized Team Sync**: Collaborative sync operates directly between peers over LAN/WiFi using secure pairings, eliminating the need for expensive centralized servers.

---

### Core Operations

Here is how Notely handles workspace initializations:

\`\`\`javascript
/**
 * Concept of Notely workspace startup sequence
 */
async function bootWorkspace(selectedPath) {
  // Validate path boundaries
  const isAllowed = await window.notesApi.verifyPath(selectedPath);
  if (!isAllowed) throw new Error("Sandbox boundary violation");

  // Load files list and configure live watcher
  const docs = await window.notesApi.listDocuments(selectedPath);
  await window.notesApi.initializeFileWatcher(selectedPath);
  
  return docs;
}
\`\`\`

Explore the folders to learn more about Markdown custom formatting, assets, AI search, and P2P sync!
`,
      cleansed: "Notely App Overview. Welcome to the Notely local-first desktop application."
    });

    // Create folders
    const guidesFolder = await createFolder("Guides", workspacePath);
    const advancedFolder = await createFolder("Advanced", workspacePath);

    // 2. Guides Folder - Note 1
    const markdownDoc = await createDocument("Markdown & Features", guidesFolder.filePath);
    await saveDocument({
      filePath: markdownDoc.filePath,
      header: "Name: Markdown & Features\nTags: guide, markdown\nLocation: User Guide\nTime: 11:00, 10 Jul 2026 to 12:00, 10 Jul 2026\n",
      rawNotes: `# Markdown & Core Rendering Features

Notely is designed to make document formatting simple and powerful. We write in standard Markdown and enrich it with customizable, interactive preview elements.

### The Parsing & Compilation Pipeline

Every time you type in the editor, Notely updates the preview using a custom Markdown parsing pipeline:

\`\`\`mermaid
flowchart LR
    Editor[CodeMirror 6 Editor] -->|Raw String| Parser[Markdown-It Parser]
    Parser -->|Parse Blocks| CustomRules{Custom Token Rules?}
    CustomRules -->|Mermaid Block| MermaidContainer[Inject div.mermaid]
    CustomRules -->|Excalidraw Link| ExcalidrawContainer[Inject Excalidraw Frame]
    CustomRules -->|Image Ref| ImageWrapper[Inject markdown-image-frame]
    MermaidContainer --> Render[Dynamic Module Script Render]
    ExcalidrawContainer --> Render
    ImageWrapper --> Render
    Render --> HTML[Beautiful CSS Grid Preview]
\`\`\`

### Custom Formatting Enhancements

Beyond standard headers, **bold**, *italics*, and ~~strikethrough~~, Notely implements:
- **Interactive Code Blocks**: Code blocks have a header displaying the language, a wand button for formatting, a pencil button for inline edits, and a copy button.
- **Annotated Image Frames**: Images are wrapped in interactive frames. Hovering reveals actions to annotate or view.
- **Embedded Diagrams**: Excalidraw and Mermaid render directly in split-screen or preview modes.

### Status Tracker

| Feature | Support Level | Implementation |
| :--- | :--- | :--- |
| Markdown Rendering | Native | Markdown-It + HLJS |
| Mermaid Diagrams | Dynamic | ESM CDN Lazy Load |
| Excalidraw Drawings | Embed | Local SVG / Canvas |

- [x] Read the introductory overview note
- [x] Read this Markdown formatting note
- [ ] Create a custom Mermaid diagram of your own
- [ ] Open the Workspace Graph to see note links
`,
      cleansed: "Markdown & Core Rendering Features guide. Understand the parsing pipeline."
    });

    // 3. Guides Folder - Note 2
    const mediaDoc = await createDocument("Media and Assets", guidesFolder.filePath);
    await saveDocument({
      filePath: mediaDoc.filePath,
      header: "Name: Media and Assets\nTags: guide, media\nLocation: User Guide\nTime: 13:00, 10 Jul 2026 to 14:00, 10 Jul 2026\n",
      rawNotes: `# Managing Media and Assets

In Notely, media files are stored locally within your workspace under the hidden \`.notes-app\` metadata folder. This keeps your workspace root clean while preserving all reference paths.

### Ingestion and Annotation Workflow

The diagram below outlines the full lifecycle of an asset added to Notely:

\`\`\`mermaid
stateDiagram-v2
    [*] --> DragDrop : Drop image in Editor
    DragDrop --> FileCopied : Copy to .notes-app/assets/
    FileCopied --> MarkdownGenerated : Insert ![alt](asset_path)
    MarkdownGenerated --> EditorView : Render in Preview
    EditorView --> ImageAnnotation : Hover & Click Annotate
    ImageAnnotation --> MetadataSaved : Save annotation text to settings
    MetadataSaved --> RenderedOverlay : Draw text on top of image
\`\`\`

### Asset Capabilities
1. **Drag and Drop**: Drop any PNG, JPEG, GIF, PDF, MP4, or MP3 file into the editor, and Notely will handle the rest.
2. **Crop & Rotate**: Edit images natively in the app without launching external editors.
3. **Badging**: If you edit an asset, Notely saves the original source and displays an "Original Saved" badge, letting you roll back changes at any time.

\`\`\`css
/* Embedded CSS Demo */
.notely-image-frame {
  position: relative;
  display: block;
  max-width: 100%;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
\`\`\`
`,
      cleansed: "Managing Media and Assets. Ingestion and Annotation workflow details."
    });

    // 4. Advanced Folder - Note 1
    const aiDoc = await createDocument("AI and Search", advancedFolder.filePath);
    await saveDocument({
      filePath: aiDoc.filePath,
      header: "Name: AI and Search\nTags: advanced, ai\nLocation: Engine Room\nTime: 15:00, 10 Jul 2026 to 16:00, 10 Jul 2026\n",
      rawNotes: `# AI Integration and Semantic Search

Notely's AI subsystem works entirely local-first for data indexation, generating vector embeddings to represent note semantics.

### How Semantic Search and Knowledge Clustering Works

Instead of traditional keyword searching, Notely leverages cosine similarity computations to map relationships:

\`\`\`mermaid
flowchart TD
    RawNote[Note Markdown Content] -->|Extract Blocks| CleanText[Text Content]
    CleanText -->|HuggingFace Embedder| Vector[768-dimension Vector]
    Vector -->|Store Locally| VectorDB[Local Vector cache]
    
    Query[User Semantic Search Query] -->|HF Embedder| QueryVector[Query Vector]
    QueryVector --> CosineSimilarity[Cosine Similarity Check]
    VectorDB --> CosineSimilarity
    CosineSimilarity -->|Matches threshold| UI[List Relevant Notes]
    CosineSimilarity -->|Clusters mapping| Graph[Visual Knowledge Graph Nodes]
\`\`\`

### Features Included:
- **Semantic Search**: Search for concepts like "getting started tips" and retrieve files matching that concept, even if the exact words don't match.
- **Smart Note Graph**: Documents are clustered by mathematical distance, highlighting related docs and hidden connections.
- **AI Assist Palette**: Ask AI to draft notes, polish selected text, or summarize details.
`,
      cleansed: "AI Integration and Semantic Search. Knowledge clustering mechanics."
    });

    // 5. Advanced Folder - Note 2
    const syncDoc = await createDocument("Peer-to-Peer Sync", advancedFolder.filePath);
    await saveDocument({
      filePath: syncDoc.filePath,
      header: "Name: Peer-to-Peer Sync\nTags: advanced, p2p\nLocation: Network Hub\nTime: 17:00, 10 Jul 2026 to 18:00, 10 Jul 2026\n",
      rawNotes: `# Decentralized Peer-to-Peer Sync

Notely's sync engine lets you share notes between devices directly without cloud servers, maintaining data sovereignty and absolute privacy.

### P2P Handshake and Update Propagation

Syncing relies on a secure pairing protocol and encrypted queue propagation:

\`\`\`mermaid
sequenceDiagram
    autonumber
    participant Alice as "Alice (Notely Client A)"
    participant Bob as "Bob (Notely Client B)"

    Alice->>Alice: Generate LAN Broadcast invite code
    Bob->>Alice: Connect and submit handshake code
    Note over Alice,Bob: Handshake pairs keys via Noise Protocol
    Alice->>Bob: Sync Workspace Metadata & History
    Note over Alice,Bob: Peer-to-Peer connection established
    
    rect rgb(240, 248, 255)
        Note left of Alice: Alice edits note.md
        Alice->>Alice: Hash content & queue change in outbox
        Alice->>Bob: Propagate Sync Event (AES-256-GCM Encrypted)
        Bob->>Bob: Verify hash signature & apply updates
    end
\`\`\`

### Conflict Management
If the same document is edited on both devices while disconnected, Notely detects the fork, halts automatic overwriting, and prompts you to resolve the conflict in the **Conflict Center**. You can review the diff side-by-side and choose local, remote, or merged text.
`,
      cleansed: "Decentralized Peer-to-Peer Sync. Secure key handshakes and propagation."
    });

  } catch (err) {
    console.error("Failed to setup demo workspace:", err);
    throw err;
  }
}
