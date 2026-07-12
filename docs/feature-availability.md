---
title: Feature Availability Matrix
description: View offline compatibility and network requirements for Notely features.
keywords: internet required, offline support, offline setup, capabilities
category: Reference
---

# Feature Availability

The matrix below details which features run entirely offline, which require local network settings, and which require internet access.

<FeatureMatrix :features="[
  { feature: 'Notes Create/Edit', available: true, setup: 'No', internet: false },
  { feature: 'Folder Organization', available: true, setup: 'No', internet: false },
  { feature: 'Edit/Split/Preview Modes', available: true, setup: 'No', internet: false },
  { feature: 'Markdown Validation', available: true, setup: 'No', internet: false },
  { feature: 'Typo Checking', available: true, setup: 'No', internet: false },
  { feature: 'Global Search', available: true, setup: 'No', internet: false },
  { feature: 'Help Center', available: true, setup: 'No', internet: false },
  { feature: 'Tasks Dashboard', available: true, setup: 'No', internet: false },
  { feature: 'Version History (Git)', available: true, setup: 'No', internet: false },
  { feature: 'Media Library', available: true, setup: 'No', internet: false },
  { feature: 'Embedded Terminal', available: true, setup: 'No', internet: false },
  { feature: 'Screen Capture (Windows)', available: true, setup: 'No', internet: false },
  { feature: 'Mermaid Diagrams', available: true, setup: 'No', internet: false },
  { feature: 'Excalidraw Diagrams', available: true, setup: 'No', internet: false },
  { feature: 'Workspace Graph', available: true, setup: 'No', internet: false },
  { feature: 'Sync with other devices', available: false, setup: 'Pair Trusted Devices', internet: 'Local network' },
  { feature: 'AI Chat & Rewriting', available: false, setup: 'Setup AI Provider', internet: true },
  { feature: 'Meaning-based Search', available: false, setup: 'Setup AI Provider', internet: true },
  { feature: 'Graph Clustering', available: false, setup: 'Setup AI Provider', internet: true }
]" />
