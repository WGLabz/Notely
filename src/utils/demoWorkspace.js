import { createDocument, saveDocument } from "../services/electronService";

export async function setupDemoWorkspace(workspacePath) {
  try {
    // 1. Welcome to Notely note
    const welcomeDoc = await createDocument("Welcome to Notely", workspacePath);
    await saveDocument({
      filePath: welcomeDoc.filePath,
      header: "---\ntags:\n  - guide\n  - welcome\n---\n",
      rawNotes: `# Welcome to Notely!

Welcome to your new workspace. Notely is designed for team and project workspaces, making it easy to write documentation, take meeting notes, and manage media.

### Features to Explore
- **Split View**: Click the split toggle in the top-right toolbar to view raw markdown side-by-side with live rendered preview.
- **Task Tracking**: Try creating checklist items like \`- [ ] Read User Guide\`. Notely will automatically aggregate them in the Dashboard and Tasks panel.
- **Media Library**: Drag and drop images directly into the editor. You can browse, annotate, and crop them in the Assets tab on the landing screen.
`,
      cleansed: "Welcome to Notely! Welcome to your new workspace."
    });

    // 2. Getting Started with Diagrams note
    const diagramDoc = await createDocument("Getting Started with Diagrams", workspacePath);
    await saveDocument({
      filePath: diagramDoc.filePath,
      header: "---\ntags:\n  - guide\n  - diagrams\n---\n",
      rawNotes: `# Diagrams in Notely

Notely has built-in support for live rendered diagrams.

### Mermaid Support
Create flowchart diagrams using standard Mermaid code blocks:

\`\`\`mermaid
graph TD
    A[Start Onboarding] --> B[Choose Folder]
    B --> C[Personalize Theme]
    C --> D[Begin Writing Notes!]
\`\`\`

### Excalidraw Support
You can insert sketch blocks to draw diagrams by clicking the Excalidraw button in the toolbar.
`,
      cleansed: "Diagrams in Notely. Create flowchart diagrams using standard Mermaid."
    });

    // 3. AI and Search note
    const aiDoc = await createDocument("AI and Search", workspacePath);
    await saveDocument({
      filePath: aiDoc.filePath,
      header: "---\ntags:\n  - guide\n  - ai\n---\n",
      rawNotes: `# AI Integration and Search

Connect Gemini or Groq API keys in the settings tab to unlock:
- **Semantic Search**: Ask questions or search concepts across all project files by meaning rather than exact word matching.
- **Workspace AI Chat**: Chat with a helper agent that has full context of your workspace documents.
- **Interactive Note Graph**: Visualize and navigate links between your notes dynamically.
`,
      cleansed: "AI Integration and Search. Connect Gemini or Groq API keys."
    });

  } catch (err) {
    console.error("Failed to setup demo workspace:", err);
    throw err;
  }
}
