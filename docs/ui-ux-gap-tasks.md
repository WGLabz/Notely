# UI/UX Gap Tracker (Closable Tasks)

Purpose: Track and close UI/UX issues found during the desktop audit.

How to close a task:
- Change [ ] to [x]
- Add owner and date in the notes field
- Link PR/commit when completed

## Critical

- [x] C-01 Accessibility baseline is below enterprise standards
  - Gap: Multiple controls suppress default focus outlines and use low-visibility custom focus states.
  - Why it matters: Keyboard users can lose context and fail basic navigation tasks.
  - Done when: All interactive controls have consistent, visible focus indicators that pass WCAG 2.2 focus appearance expectations.
  - Notes: Owner: UI Team | Date: 2026-07-02 | PR: pending

- [x] C-02 Text legibility is too small in metadata and utility UI
  - Gap: Several surfaces use 9px to 11px text, including metadata and tags.
  - Why it matters: Fails readability at normal desktop distance and increases cognitive strain.
  - Done when: Minimum body and utility text scale is normalized (recommended 12 to 14px minimum depending on role).
  - Notes: Owner: UI Team | Date: 2026-07-02 | PR: pending

- [x] C-03 No complete dark mode or system theme integration
  - Gap: App is hard-coded to light palette with no native theme listener or synchronized theme token system.
  - Why it matters: Below user expectations for modern Electron tools and weak for low-light environments.
  - Done when: Full light and dark themes are tokenized and switched by system preference with override option.
  - Notes: Owner: UI Team | Date: 2026-07-02 | PR: pending

- [x] C-04 No explicit zoom strategy for accessibility and HiDPI adaptability
  - Gap: No defined app-level zoom controls and no documented zoom persistence behavior.
  - Why it matters: Users with low vision or high-density displays cannot reliably scale UI.
  - Done when: Zoom in, zoom out, reset zoom are available in menu/shortcuts and persisted per user.
  - Notes: Owner: UI Team | Date: 2026-07-02 | PR: pending

## High

- [x] H-01 Design token entropy is very high
  - Gap: Large spread of one-off values across font sizes, radii, shadows, and colors.
  - Why it matters: Creates visual drift, slows iteration, and increases QA burden.
  - Done when: Core token set is defined and at least 80 percent of components consume tokens, not literals.
  - Notes: Status: Closed | Owner: UI Team | Date: 2026-07-02 | PR: pending | Core token system now drives major shell and high-traffic overlays, including Workspace Graph token migration (surface, border, accent, text, spacing, radius, and shadow tokens) with primitive input/icon controls; remaining literal values are intentional semantic palette data (folder/cluster colors) rather than ad-hoc UI chrome.

- [x] H-02 Global spacing system is inconsistent
  - Gap: Dense mix of unique padding, margin, and gap values without a scale.
  - Why it matters: Produces uneven rhythm and inconsistent scan patterns.
  - Done when: Spacing scale is standardized and component spacing mapped to that scale.
  - Notes: Owner: UI Team | Date: 2026-07-02 | PR: pending

- [x] H-03 Corner radius and elevation language is inconsistent
  - Gap: Many radius and shadow variants across overlays, cards, and tool surfaces.
  - Why it matters: Weakens product identity and perceived quality.
  - Done when: Radius and elevation tiers are standardized and documented in the design system.
  - Notes: Owner: UI Team | Date: 2026-07-02 | PR: pending

- [x] H-04 Window sizing policy is rigid for diverse displays
  - Gap: Large fixed minimum window sizes reduce flexibility on smaller monitors and split-screen workflows.
  - Why it matters: Limits usability for multi-window and constrained screen environments.
  - Done when: Min sizes are validated against common enterprise screen setups and adapted per surface.
  - Notes: Owner: UI Team | Date: 2026-07-02 | PR: pending

- [x] H-05 Overuse of overflow hidden increases clipping risk
  - Gap: Many containers enforce overflow hidden.
  - Why it matters: Can hide content, focus rings, and contextual controls.
  - Done when: Overflow is only used where behavior is intentional and verified by interaction tests.
  - Notes: Status: Closed | Owner: UI Team | Date: 2026-07-02 | PR: pending | Overflow-hidden audit completed after latest UI cleanup. Remaining uses are intentional and scoped to structural framing or truncation only: pill/split controls (`inline-unused-group`, `media-unused-group`), card/canvas framing (`media-item`, `media-preview`, `media-full-preview-content`, `media-preview-pane`, `media-preview-image-full`, `media-preview-pdf-container`, `wgp-node`, React Flow controls/minimap wrappers, Excalidraw frame containers), and text truncation (`media-preview-name`, `media-type-chip`, `media-alt`, `media-preview-filename`, `media-usage-row-text span`, `media-preview-image-annotation`). No actionable controls rely on clipped overflow for visibility.

- [x] H-06 Dialog and overlay patterns are fragmented
  - Gap: Multiple overlays exist with mixed spacing, headers, and interaction styles.
  - Why it matters: Modal behavior feels inconsistent and increases relearning cost.
  - Done when: One modal primitive and two approved variants cover all dialogs.
  - Notes: Status: Closed | Owner: UI Team | Date: 2026-07-02 | PR: pending | OverlayDialog now powers major App flows plus AI palette/settings, Excalidraw editor, Workspace Graph, Image Crop, Document Detail modals, and media preview/usage overlays with variant support; remaining role=dialog elements in MarkdownToolbar are anchored popovers, not modal overlays.

- [x] H-07 Navigation depth and command discoverability need simplification
  - Gap: Features are split across menu, overlays, and panels with uneven discoverability.
  - Why it matters: New users struggle to form a stable mental model.
  - Done when: Primary workflows have single obvious entry points and command aliases in palette.
  - Notes: Status: Closed | Owner: Product + UX | Date: 2026-07-02 | PR: pending | Command palette now includes explicit entry points and aliases for primary workflows (new note, global search, AI palette, workspace graph, workspace/activity/status tools, and go-home navigation), reducing feature hunting across menus and overlays while preserving existing shortcuts.

- [x] H-08 Table and card views need stricter parity
  - Gap: Action affordances and metadata emphasis differ by view mode.
  - Why it matters: Users switching view modes lose consistency and confidence.
  - Done when: Equivalent actions, labels, and hierarchy are available in both modes.
  - Notes: Status: Closed | Owner: UX + Frontend | Date: 2026-07-02 | PR: pending | Table and tile views now use equivalent metadata messaging and action affordances, with parity locked by integration coverage in `DocumentList.viewParity.test.jsx` (validated in Vitest) to prevent divergence regressions.

- [x] H-09 Form controls are not fully standardized
  - Gap: Inputs, selects, chips, and action buttons vary heavily in dimensions and typography.
  - Why it matters: Inconsistent motor and visual patterns reduce speed and accuracy.
  - Done when: Unified form control specs are enforced via reusable components.
  - Notes: Status: Closed | Owner: UI Team | Date: 2026-07-02 | PR: pending | Unified reusable control primitives are now in place and actively used across core workflows: `DialogSelectField`, `AppButton`, `AppIconButton`, `AppInput`, `AppSelect`, `AppChipButton`, and `AppTextarea`. High-traffic surfaces (DocumentDetail, MediaTab, AISettings, AIPalette, P2PStatusPanel, WorkspaceActivityPanel, AIChatPanel, ConflictResolutionPanel, and related dialogs) are migrated; primitive APIs were normalized for consistency (forwardRef on icon buttons, className-first chip usage with backward compatibility). Remaining raw controls are specialized editor/popover widgets outside baseline form-control standardization scope.

- [x] H-10 Focus mode and outline mode interactions need clearer UX contracts
  - Gap: Layout shifts significantly by mode and can hide context unexpectedly.
  - Why it matters: Context loss interrupts flow during editing.
  - Done when: Mode transitions are explicit, reversible, and preserve orientation cues.
  - Notes: Status: Closed | Owner: Product + UX | Date: 2026-07-02 | PR: pending | Focus/outline transitions are now explicit and reversible: contextual mode-contract banners surface active state and one-click exit/restore actions; focus-mode and outline-toggle actions emit clear orientation notifications; integration coverage validates banner behavior in DocumentDetail.

## Medium

- [x] M-01 Typography hierarchy needs consolidation
  - Gap: Heading and utility text roles overlap with inconsistent scale jumps.
  - Why it matters: Weakens information hierarchy and scannability.
  - Done when: Type ramp defines display, heading, body, caption, and mono roles with fixed usage rules.
  - Notes: Owner: UI Team | Date: 2026-07-02 | PR: pending

- [x] M-02 Iconography style needs normalization
  - Gap: Mixed icon sizes and visual weights across surfaces.
  - Why it matters: Reduces polish and action clarity.
  - Done when: Icon grid, size tokens, and stroke usage are standardized.
  - Notes: Status: Closed | Owner: Design System | Date: 2026-07-02 | PR: pending | Lucide icon sizing now adheres to a normalized step grid (12/14/16/18/20) across component surfaces; outlier sizes were aligned and a policy test (`IconographyNormalization.test.js`) now guards against non-standard icon size regressions.

- [x] M-03 Empty, loading, and error states need stronger consistency
  - Gap: Messaging and visual treatment differ between modules.
  - Why it matters: State transitions feel uneven and less trustworthy.
  - Done when: Shared state components exist for loading, empty, warning, and error.
  - Notes: Owner: UI Team | Date: 2026-07-02 | PR: pending

- [x] M-04 Feedback patterns need consistency
  - Gap: Toast, inline messages, and banners do not share one semantic framework.
  - Why it matters: Users cannot reliably interpret severity and actionability.
  - Done when: Feedback taxonomy defines info, success, warning, and danger with consistent styles.
  - Notes: Owner: UI Team | Date: 2026-07-02 | PR: pending

- [x] M-05 Motion and transition language is partially ad hoc
  - Gap: Some overlays animate while similar ones do not.
  - Why it matters: Product feels less cohesive.
  - Done when: Motion tokens define durations and easing for major interaction classes.
  - Notes: Owner: UI Team | Date: 2026-07-02 | PR: pending

- [x] M-06 Data density presets need calibration
  - Gap: Compact mode risks readability, comfortable mode can waste space.
  - Why it matters: Both modes should remain efficient and legible.
  - Done when: Density presets are tuned with measurable row/card information targets.
  - Notes: Status: Closed | Owner: UX + QA | Date: 2026-07-02 | PR: pending | Document list density is now calibrated with explicit measurable targets for compact vs comfortable modes (rows/cards per viewport) via shared density profiles and bound CSS variables; regression coverage added in `DocumentList.densityCalibration.test.jsx` and parity retained in `DocumentList.viewParity.test.jsx`.

- [x] M-07 Settings IA should be reorganized by user intent
  - Gap: Technical and user-facing preferences are mixed.
  - Why it matters: Increases decision friction in setup.
  - Done when: Settings are grouped into simple categories with progressive disclosure.
  - Notes: Status: Closed | Owner: Product + UX | Date: 2026-07-02 | PR: pending | AI settings are reorganized by user intent (Connect Providers, Assistant Behavior) with progressive disclosure for advanced generation tuning and data/privacy controls, reducing initial cognitive load while preserving full controls.

- [x] M-08 Accessibility QA coverage needs expansion
  - Gap: No explicit documented keyboard-only and screen-reader acceptance checklist.
  - Why it matters: Regressions are likely.
  - Done when: Accessibility regression checklist and CI-level smoke tests are in place.
  - Notes: Status: Closed | Owner: QA | Date: 2026-07-02 | PR: pending | Accessibility regression checklist added (`docs/accessibility-regression-checklist.md`) and CI-level smoke coverage added (`src/components/accessibility.smoke.test.js`, `npm run test:a11y-smoke`, integrated into `ci:check`) for dialog semantics, keyboard navigation, and keyboard-openable list rows.

## Low

- [x] L-01 Improve polish of microcopy and labels
  - Gap: Label style and casing conventions vary by module.
  - Why it matters: Small quality cues influence enterprise trust.
  - Done when: UX writing guide defines capitalization, tone, and action verbs.
  - Notes: Status: Closed | Owner: Product + UX Writing | Date: 2026-07-02 | PR: pending | UX writing guide added (`docs/ux-writing-guide.md`) and high-traffic UI copy normalized for consistency (command palette prompt/empty state and AI settings subtitle) with sentence-case, action-oriented wording.

- [x] L-02 Align border contrast across neutral surfaces
  - Gap: Some borders are too subtle while others are visually heavy.
  - Why it matters: Impacts visual grouping quality.
  - Done when: Neutral border tokens cover subtle, default, and strong states.
  - Notes: Owner: UI Team | Date: 2026-07-02 | PR: pending

- [x] L-03 Refine contextual action reveal behavior
  - Gap: Some action buttons are hidden until hover, reducing discoverability.
  - Why it matters: Keyboard and novice users may miss key actions.
  - Done when: Essential actions are persistently discoverable with optional progressive disclosure.
  - Notes: Owner: UI Team | Date: 2026-07-02 | PR: pending

- [x] L-04 Improve visual consistency of secondary panels
  - Gap: Side panels vary in border, fill, and heading styles.
  - Why it matters: Weakens coherent desktop shell feel.
  - Done when: Secondary panel recipe is standardized and reused.
  - Notes: Owner: UI Team | Date: 2026-07-02 | PR: pending

## Suggested Workflow Columns

You can manage this as a simple board using status tags in each task note:
- Open
- In Progress
- Blocked
- Ready for QA
- Closed

Example notes format:
- Notes: Status: Open | Owner: Alex | Date: 2026-07-02 | PR: -
