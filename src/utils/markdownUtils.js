/**
 * Markdown and text utility functions
 */

export function replaceTextAtSelection(value, start, end, insertion) {
  const safeStart = Number.isInteger(start) ? start : value.length;
  const safeEnd = Number.isInteger(end) ? end : safeStart;
  return value.slice(0, safeStart) + insertion + value.slice(safeEnd);
}

export function insertTextAtCursor(value, onChange, text, textareaRef) {
  if (!textareaRef?.current) {
    console.error("Textarea ref not available");
    const textarea = document.querySelector(".markdown-textarea");
    if (!textarea) {
      console.error("Could not find textarea element");
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = replaceTextAtSelection(value, start, end, text);
    onChange(next);
    return;
  }

  const textarea = textareaRef.current;
  const previousScrollTop = Number(textarea.scrollTop) || 0;
  const previousScrollLeft = Number(textarea.scrollLeft) || 0;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const next = replaceTextAtSelection(value, start, end, text);
  onChange(next);

  // Set focus and selection after React updates
  setTimeout(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = start + text.length;
      textareaRef.current.selectionEnd = start + text.length;
      textareaRef.current.scrollTop = previousScrollTop;
      textareaRef.current.scrollLeft = previousScrollLeft;
    }
  }, 0);
}

export function applySnippet(
  value,
  onChange,
  textareaRef,
  before,
  after = "",
  placeholder = ""
) {
  const textarea = textareaRef?.current;
  if (!textarea) {
    console.error("Textarea not available for snippet");
    return;
  }
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end) || placeholder;
  const next =
    value.slice(0, start) + before + selected + after + value.slice(end);
  onChange(next);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = start + before.length + selected.length;
  });
}

export function normalizeImagePathForMarkdown(pathValue) {
  if (!pathValue) return pathValue;
  const trimmed = pathValue.trim();
  const unwrapped =
    trimmed.startsWith("<") && trimmed.endsWith(">")
      ? trimmed.slice(1, -1)
      : trimmed;

  let decoded = unwrapped;
  for (let i = 0; i < 5; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return encodeURI(decoded);
}

export function createImageMarkdown(altText, imagePath) {
  return `![${altText}](${normalizeImagePathForMarkdown(imagePath)})`;
}
