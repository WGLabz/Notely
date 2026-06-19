/**
 * Image service for handling image insertion operations
 */

import {
  readFileAsDataUrl,
  getImageAltText,
  validateImageFile,
  isImageFile,
} from "../utils/imageUtils";
import { saveImage } from "./electronService";
import { normalizeImagePathForMarkdown } from "../utils/markdownUtils";

export async function insertImageFromFile(file) {
  validateImageFile(file);
  console.log("Processing file:", file.name, file.type, file.size);

  const dataUrl = await readFileAsDataUrl(file);
  console.log("DataURL created, sending to Electron...");

  const imagePath = await saveImage(file.name, dataUrl);
  console.log("Image saved at:", imagePath);

  const altText = getImageAltText(file.name);
  return { imagePath: normalizeImagePathForMarkdown(imagePath), altText };
}

export async function insertImagesFromFiles(files) {
  const imageFiles = Array.from(files).filter(isImageFile);

  if (imageFiles.length === 0) {
    throw new Error("No image files selected");
  }

  const results = [];
  for (const file of imageFiles) {
    try {
      const result = await insertImageFromFile(file);
      results.push(result);
    } catch (error) {
      console.error(`Failed to insert image ${file.name}:`, error);
    }
  }

  if (results.length === 0) {
    throw new Error("Failed to insert any images");
  }

  return results;
}
