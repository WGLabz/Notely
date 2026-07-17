# Notely Application UI/UX Improvement Backlog

This backlog outlines targeted, actionable, and testable improvements to make Notely a polished, production-ready desktop editor.

## UI

- [ ] Standardize the focus ring colors globally to use `--focus-ring-color` instead of custom inline styles or mixed variables.
- [ ] Align elements in the update banner within [LandingView.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/layout/LandingView.jsx) using theme design tokens.
- [ ] Add loading skeleton preview cards in [DocumentList.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/DocumentList.jsx) to replace the simple "Loading notes and folders..." text.
- [ ] Polish hover transitions for all buttons inside [AppButton.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/AppButton.jsx) using standard timing token `--motion-standard`.

## UX

- [ ] Add an Undo/Redo prompt banner or notification toast feedback when applying markdown quick fixes.
- [ ] Implement an explicit "Discard Changes" warning dialog before closing unsaved note tabs.
- [ ] Create a "Copy Link Path" context menu action for documents to make referencing other notes easier.
- [ ] Support double-clicking on list items in table view mode to open them immediately.

## Navigation

- [ ] Add horizontal scroll capability or tab-overflow chevron buttons to [NoteTabBar.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/NoteTabBar.jsx) when many tabs are open.
- [ ] Introduce a breadcrumb navigation trail at the top of [DocumentDetail.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/DocumentDetail.jsx) to match the Landing View folder depth indicator.
- [ ] Standardize keyboard-driven tab switching (`Ctrl+Tab` and `Ctrl+Shift+Tab`) across opened notes.

## Layout

- [ ] Add split-resizer boundary limits in [LandingView.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/layout/LandingView.jsx) to prevent dragging the workspace rail to 0 width.
- [ ] Prevent grid content in [LandingView.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/layout/LandingView.jsx) from layout-shifting when toggling the sidebar.
- [ ] Normalize grid spacings in [DashboardPanels.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/DashboardPanels.jsx) to use spacing variables like `--space-5`.

## Design System

- [ ] Extract inline colors used for contrast backgrounds in [DocumentList.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/DocumentList.jsx) into semantic CSS utility classes in [variables.css](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/styles/variables.css).
- [ ] Standardize the border-radius property on custom modals like `IconColorPickerModal` to use `--radius-lg` consistently.
- [ ] Centralize CSS animation keyframes across all CSS files into [base.css](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/styles/base.css).

## Shared Components

- [ ] Replace custom inputs in modals with [AppInput.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/AppInput.jsx) to unify styles.
- [ ] Replace native textareas in editors with [AppTextarea.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/AppTextarea.jsx).
- [ ] Standardize tooltip display positioning logic inside [GlobalTooltip.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/GlobalTooltip.jsx).

## Forms

- [ ] Standardize error validation layouts inside settings menus to use red alert states based on `--status-danger-border`.
- [ ] Disable submit buttons automatically when required input fields are blank in the onboarding flow.

## Dialogs

- [ ] Wrap modal overlays in [OverlayDialog.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/OverlayDialog.jsx) with custom focus trap hook `useFocusTrap` to prevent keyboard focus escaping the modal.
- [ ] Implement clicking on the overlay background to dismiss safe-to-close dialogs.

## Toolbar

- [ ] Replace raw buttons in [MarkdownToolbar.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/MarkdownToolbar.jsx) with [AppIconButton.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/AppIconButton.jsx).
- [ ] Unify layout grid of sub-popovers in the toolbar to prevent overflow on lower resolution screens.

## Notes Editor

- [ ] Integrate CodeMirror's highlight active line gutter styling with the dark theme settings.
- [ ] Improve positioning of the Markdown Table Editor helper overlay so it does not cover context lines.

## Electron / Desktop

- [ ] Store and restore sidebar layout widths across application launches using the configuration storage.
- [ ] Bind custom native title bar actions in [TitleBar.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/layout/TitleBar.jsx) to OS-native window frame events.
- [ ] Implement custom context menus utilizing Electron API rather than standard HTML lists inside the note editor.

## Accessibility

- [ ] Add explicit `aria-label` tags to snippet action buttons in the toolbar.
- [ ] Ensure all custom modal trigger buttons receive keyboard focus indicator states when navigating via Tab key.
- [ ] Restructure HTML hierarchy of heading levels inside [DashboardPanels.jsx](file:///c:/Users/oksbw/OneDrive/Desktop/Antigravity%20Workspace/Notely/src/components/DashboardPanels.jsx) to follow standard semantic order.
