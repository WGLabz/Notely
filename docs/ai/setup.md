---
title: Setting Up AI Providers
description: Configure AI settings, API keys, local endpoints, and feature flags.
keywords: AI settings, API key, Ollama, OpenAI, HuggingFace token, embeddings
category: AI
---

# AI Setup

Configure models and API settings in the **AI → AI Settings** menu.

## 1. Provider Setup

Configure separate models for text generation and semantic features:

- **Text Provider**: Generates chat responses and executes text rewrites. Supports Local API Endpoints (e.g. Ollama, LM Studio) and OpenAI.
- **Embeddings Provider**: Generates vector representations of your notes for meaning-based search. Supported via HuggingFace token configurations.
- **Connection Test**: Click **Test** next to either service to verify authentication and connection parameters.

---

## 2. Feature Toggles

- **Learn User Patterns**: Allows the system to capture local usage context to improve suggestions.
- **Generate Embeddings**: Builds a local vector database of note contents for search.
- **Discover Relationships**: Analyzes references to map semantic proximity in the workspace graph.

---

## 3. Advanced Parameters

Fine-tune AI responses:
- **Temperature**: Controls creativity. Lower values yield structured, predictable output; higher values yield creative variations.
- **Max Tokens**: Bounds response length to manage speed and resource consumption.
- **Local Storage Path**: Shows where cache data is saved, with a button to **Clear Learned Data**.
