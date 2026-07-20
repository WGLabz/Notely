---
title: Setting Up AI Providers
description: Configure AI settings, API keys, local endpoints, and feature flags.
keywords: AI settings, API key, Ollama, OpenAI, Gemini, Groq, HuggingFace, ONNX, BGE embeddings
category: AI
---

# AI Setup

Configure LLM provider models, API tokens, and local vector index settings inside **AI → AI Settings**.

---

## 1. Text Generation Providers

Notely uses the **Vercel AI SDK** to connect to multiple LLM APIs:
- **Google Gemini**: Requires a Gemini API key. Highly recommended for rich tool calling.
- **Groq**: Requires a Groq API key (supports models like `llama-3.3-70b-specdec`).
- **OpenAI Compatible**: Connect to OpenAI or local servers (Ollama, LM Studio) by setting a custom Base URL and Model name.
- **Connection Diagnostics**: Click the **Test** button next to any configured provider to run a diagnostic round-trip test.

---

## 2. Embedding Index Setup

Vector embeddings enable Semantic Search and Knowledge Graph mappings:
- **Local BGE Model (Recommended)**: Runs entirely offline inside your app. Downloads a lightweight `BGE-small-en-v1.5` ONNX model (~130MB) into `%AppData%/notely/ai-model/` and runs vector calculations locally.
- **HuggingFace API**: Runs cloud-based embeddings using an API key token.
- **Text Provider Embedding**: Reuses the active generation model if it supports embeddings.

---

## 3. SQLite Database Locality

All AI databases are workspace-scoped and stored inside the hidden `{workspace}/.notes-app/` folder to keep your data local and portable:
1. `ai-embeddings.db`: Stores chunk text, line mappings, content hashes, and indexing queues.
2. `ai-graph.db`: Stores extracted entity nodes and relationships.
3. `ai-memory.db`: Stores conversation sessions, message logs, and pattern analysis.

PRAGMA `journal_mode = WAL` and `synchronous = NORMAL` are enabled across all databases for high performance without write blocks.
