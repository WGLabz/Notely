---
title: Keyboard Shortcuts
description: Complete reference of all keyboard shortcuts in Notely.
keywords: shortcuts, hotkeys, keybinds, keyboard, cheat sheet
category: Reference
---

# Keyboard Shortcuts

Use shortcuts to navigate and edit notes quickly.

## General Navigation

<ShortcutTable :shortcuts="[
  { action: 'Open Help Center', key: 'F1' },
  { action: 'Open Keyboard Shortcuts', key: 'Ctrl + /' },
  { action: 'Open Command Palette', key: 'Ctrl + K' },
  { action: 'Open Workspace Selector', key: 'Ctrl + Shift + N' },
  { action: 'Show Workspace Activity', key: 'Ctrl + Shift + A' },
  { action: 'Switch to Next Tab', key: 'Ctrl + Tab' },
  { action: 'Switch to Previous Tab', key: 'Ctrl + Shift + Tab' }
]" context="General" />

## Note Editor

<ShortcutTable :shortcuts="[
  { action: 'Create New Note', key: 'Ctrl + N' },
  { action: 'Find in Note', key: 'Ctrl + F' },
  { action: 'Find and Replace', key: 'Ctrl + H' },
  { action: 'Toggle Focus Mode', key: 'Ctrl + Alt + F' },
  { action: 'Toggle Outline Panel', key: 'Ctrl + Alt + L' },
  { action: 'Format Code Block (Prettier)', key: 'Ctrl + Shift + I' },
  { action: 'Trigger Autocomplete / Suggest', key: 'Ctrl + Space' }
]" context="Editor" />

## Git & Version Control

<ShortcutTable :shortcuts="[
  { action: 'Toggle Version History', key: 'Ctrl + Shift + H' },
  { action: 'Open Workspace VS Code External', key: 'Ctrl + Shift + O' },
  { action: 'Reveal Workspace File Explorer', key: 'Ctrl + Shift + J' },
  { action: 'Open Project Web View', key: 'Ctrl + Shift + W' }
]" context="Git" />

## Screen & Media

<ShortcutTable :shortcuts="[
  { action: 'Capture Screen Area (Windows)', key: 'Ctrl + Shift + S' }
]" context="Media" />
