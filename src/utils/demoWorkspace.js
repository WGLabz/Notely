import { createDocument, saveDocument, createFolder } from "../services/electronService";

export async function setupDemoWorkspace(workspacePath) {
  try {
    // 1. Landing page note (root)
    const overviewDoc = await createDocument("Notely Overview", workspacePath);
    await saveDocument({
      filePath: overviewDoc.filePath,
      header: "---\ntags:\n  - overview\n  - root\n---\n",
      rawNotes: `# Notely App Overview

Welcome to the Notely app! Notely is a powerful desktop application built with Electron and React, designed specifically for team and project workspaces. It helps you take meeting notes, write documentation, and manage media effortlessly.

### Core Philosophy

The idea behind Notely is to keep your workspace simple yet incredibly powerful. We achieve this by blending Markdown-based editing with advanced features like AI and P2P sync.

#### Key Features
1. **Split View Editing**: See your raw Markdown alongside a live-rendered preview.
2. **AI Integration**: Ask questions, find semantic relationships, and chat with your workspace.
3. **Peer-to-Peer Sync**: Collaborate across devices without relying on a central server.

### Example Code

Here is a quick snippet of how Notely handles some core operations behind the scenes:

\`\`\`javascript
function initializeWorkspace(path) {
  console.log("Setting up workspace at:", path);
  loadDocuments();
  startP2PSync();
}
\`\`\`

### Image Demo
![Notely Logo](https://via.placeholder.com/600x200.png?text=Notely+Workspace)

Enjoy exploring the rest of the demo notes!
`,
      cleansed: "Notely App Overview. Welcome to the Notely app!"
    });

    // Create folders
    const guidesFolder = await createFolder("Guides", workspacePath);
    const advancedFolder = await createFolder("Advanced", workspacePath);

    // 2. Guides Folder - Note 1
    const markdownDoc = await createDocument("Markdown & Features", guidesFolder.filePath);
    await saveDocument({
      filePath: markdownDoc.filePath,
      header: "---\ntags:\n  - guide\n  - markdown\n---\n",
      rawNotes: `# Markdown & Core Features

Notely fully embraces Markdown for rapid note-taking. You can write your text seamlessly while taking advantage of our custom extensions.

### Text Formatting

You can use **bold**, *italics*, and even ~~strikethrough~~. We also support blockquotes:
> "Notely is the best tool for local-first team collaboration."

### Diagram Support

Create flowchart diagrams directly inside your notes using standard Mermaid code blocks. The app will render them beautifully.

\`\`\`mermaid
graph TD
    A[Start Onboarding] --> B[Choose Folder]
    B --> C[Personalize Theme]
    C --> D[Begin Writing Notes!]
\`\`\`

### Tables and Task Lists

| Feature | Status |
| :--- | :--- |
| Markdown | Active |
| Excalidraw | Active |
| AI Chat | Beta |

- [x] Read this note
- [ ] Try creating a new note
- [ ] Connect AI Provider

![Features Preview](https://via.placeholder.com/400x250.png?text=Notely+Features)
`,
      cleansed: "Markdown and Core Features."
    });

    // 3. Guides Folder - Note 2
    const mediaDoc = await createDocument("Media and Assets", guidesFolder.filePath);
    await saveDocument({
      filePath: mediaDoc.filePath,
      header: "---\ntags:\n  - guide\n  - media\n---\n",
      rawNotes: `# Managing Media and Assets

A great workspace isn't just about text. Notely makes handling media files a breeze.

### Drag and Drop

You can drag and drop images directly into the editor. We automatically manage the paths and assets folder for your project. 
Once dropped, you can browse, annotate, and crop them in the **Assets tab** on the landing screen.

### CSS Styling Demo

Notely also allows embedding specific styles or using standard code blocks to document UI elements.

\`\`\`css
.notely-button {
  background-color: #0a6b8a;
  color: white;
  border-radius: 8px;
  padding: 10px 20px;
}
.notely-button:hover {
  background-color: #075a75;
}
\`\`\`

![Media Workspace](https://via.placeholder.com/500x300.png?text=Media+Manager)

That's it for the media guide!
`,
      cleansed: "Managing Media and Assets."
    });

    // 4. Advanced Folder - Note 1
    const aiDoc = await createDocument("AI and Search", advancedFolder.filePath);
    await saveDocument({
      filePath: aiDoc.filePath,
      header: "---\ntags:\n  - advanced\n  - ai\n---\n",
      rawNotes: `# AI Integration and Search

Connect your Gemini or Groq API keys in the settings tab to unlock powerful features.

### Semantic Search

Instead of exact word matching, Notely embeds your notes so you can search across all project files by meaning.

\`\`\`python
# Example of how embeddings work conceptually
def embed_text(text):
    vector = ai_model.get_embeddings(text)
    return store_in_vector_db(vector)
\`\`\`

### Interactive Note Graph

Visualize and navigate links between your notes dynamically. As you write, Notely builds a knowledge graph.

![AI Graph Visualization](https://via.placeholder.com/600x300.png?text=Knowledge+Graph)
`,
      cleansed: "AI Integration and Search."
    });

    // 5. Advanced Folder - Note 2
    const syncDoc = await createDocument("Peer-to-Peer Sync", advancedFolder.filePath);
    await saveDocument({
      filePath: syncDoc.filePath,
      header: "---\ntags:\n  - advanced\n  - p2p\n---\n",
      rawNotes: `# Peer-to-Peer Sync

Notely offers a decentralized way to collaborate. 

### How it Works

Using a local-first approach, your notes stay on your machine. You can pair devices using P2P keys.

1. Go to Settings -> Sync.
2. Generate an invite code on your primary device.
3. Enter the code on your secondary device.

\`\`\`javascript
// Concept behind P2P pairing
async function pairDevice(inviteCode) {
  const peer = await P2PNetwork.connect(inviteCode);
  if (peer.isTrusted) {
    syncWorkspace(peer);
  }
}
\`\`\`

![Sync Diagram](https://via.placeholder.com/500x200.png?text=P2P+Sync)

You are now ready to master Notely!
`,
      cleansed: "Peer-to-Peer Sync details."
    });

  } catch (err) {
    console.error("Failed to setup demo workspace:", err);
    throw err;
  }
}
