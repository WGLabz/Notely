/**
 * Utility functions for extracting and managing media/images
 */

export function extractImagesFromMarkdown(content) {
  if (!content) return [];

  const regex = /!\[([^\]]*)\]\((<[^>]+>|[^)]+)\)/g;
  const images = [];
  let match;

  while ((match = regex.exec(content))) {
    const rawPath = (match[2] || "").trim();
    const path = rawPath.startsWith("<") && rawPath.endsWith(">")
      ? rawPath.slice(1, -1)
      : rawPath;
    images.push({
      altText: match[1] || "Image",
      path,
      id: path,
    });
  }

  return images;
}

export function isLocalImagePath(path) {
  return path.startsWith("./images/") || path.startsWith(".\\images\\");
}

export function getImageFileName(path) {
  return path.split(/[\\/]/).pop() || "image";
}
