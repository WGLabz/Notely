# Accessibility Regression Checklist

Purpose: catch keyboard and screen-reader regressions before release.

## Keyboard-Only Flow

- Open and close every modal with keyboard only.
- Confirm Escape closes overlays where supported.
- Confirm visible focus ring on every interactive control.
- Navigate Command Palette list with Up/Down, PgUp/PgDn, Home/End, Enter, Esc.
- In note list table mode, open rows with Enter and Space.
- Confirm focus is trapped inside modal dialogs until dismissed.

## Screen-Reader Semantics

- Confirm every modal has role dialog, aria-modal true, and a clear aria-label.
- Confirm command results list uses listbox/option semantics.
- Confirm row actions and icon-only buttons expose aria-label text.
- Confirm status banners/toasts use a live region where expected.

## Zoom & Density Smoke

- Validate 100%, 150%, and 200% zoom for clipping and focus visibility.
- Validate comfortable and compact density in table and tile views.
- Confirm density targets remain readable in compact mode.

## CI Gate

The CI smoke test must run and pass:

- npm run test:a11y-smoke

Release should be blocked when this test fails.
