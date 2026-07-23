const OPEN_TASK_REGEX = /^\s*[-*+]?\s*\[ \]\s+(.+)$/gm;
const CLOSED_TASK_REGEX = /^\s*[-*+]?\s*\[(?:x|X)\]\s+(.+)$/gm;

function getDocumentTaskSource(document) {
  if (!document || document.entryType !== "file") {
    return "";
  }

  if (typeof document.searchText === "string" && document.searchText.trim()) {
    return document.searchText;
  }

  return [document.header, document.rawNotes, document.cleansed, document.content]
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n");
}

function extractTaskMatches(text, regex, status) {
  const source = String(text || "");
  const tasks = [];

  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const line = source.slice(0, match.index).split(/\r?\n/).length;
    tasks.push({
      id: `${status}:${match.index}`,
      status,
      text: String(match[1] || "").trim(),
      index: match.index,
      line,
    });
  }

  return tasks;
}

export function extractTasksFromText(text) {
  const openTasks = extractTaskMatches(text, OPEN_TASK_REGEX, "open");
  const closedTasks = extractTaskMatches(text, CLOSED_TASK_REGEX, "closed");
  return [...openTasks, ...closedTasks].sort((left, right) => left.index - right.index);
}

export function extractTasksFromDocuments(documents) {
  const tasks = [];

  for (const document of Array.isArray(documents) ? documents : []) {
    if (document?.entryType !== "file") continue;

    const source = getDocumentTaskSource(document);
    const taskItems = extractTasksFromText(source);
    for (const task of taskItems) {
      tasks.push({
        ...task,
        id: `${document.filePath || document.title || "note"}::${task.status}:${task.index}`,
        filePath: document.filePath,
        noteTitle: document.title || document.filePath || "Untitled",
        title: document.title || document.filePath || "Untitled",
      });
    }
  }

  return tasks;
}

export function getTaskCountsFromText(text) {
  const tasks = extractTasksFromText(text);
  const open = tasks.filter((task) => task.status === "open").length;
  const closed = tasks.length - open;
  return {
    open,
    closed,
    total: tasks.length,
  };
}

export function extractOpenTasksFromDocuments(documents) {
  return extractTasksFromDocuments(documents).filter((task) => task.status === "open");
}

export function getTaskCountsFromDocuments(documents) {
  let open = 0;
  let closed = 0;

  for (const document of Array.isArray(documents) ? documents : []) {
    if (document?.entryType !== "file") continue;

    const counts = getTaskCountsFromText(getDocumentTaskSource(document));
    open += counts.open;
    closed += counts.closed;
  }

  return {
    open,
    closed,
    total: open + closed,
  };
}
