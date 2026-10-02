import { readFile, stat } from "node:fs/promises";

/** Largest image sent back inside a tool result. Bigger ones stay on disk and only the path is returned. */
export const MAX_INLINE_IMAGE_BYTES = 3 * 1024 * 1024;

/**
 * The tool result content for a PNG the app wrote: the image itself when it is small enough,
 * otherwise a note saying where the file is.
 */
export async function imageContent(path, maxBytes = MAX_INLINE_IMAGE_BYTES) {
  const { size } = await stat(path);
  if (size > maxBytes) {
    const mb = (size / (1024 * 1024)).toFixed(1);
    return [{ type: "text", text: `The image is ${mb} MB, too large to attach. It is saved at ${path}.` }];
  }
  return [{ type: "image", data: (await readFile(path)).toString("base64"), mimeType: "image/png" }];
}
