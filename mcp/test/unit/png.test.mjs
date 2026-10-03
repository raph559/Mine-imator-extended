import assert from "node:assert/strict";
import { test } from "node:test";
import { countPixels, decodePng, png } from "../app/harness.mjs";

test("decodePng reads back what png writes, and countPixels counts by colour", () => {
  const image = decodePng(png(5, 3, [10, 20, 30, 255]));
  assert.deepEqual([image.width, image.height, image.channels], [5, 3, 4]);
  assert.equal(countPixels(image, (r, g, b) => r === 10 && g === 20 && b === 30), 15);
  assert.equal(countPixels(image, (r) => r === 11), 0);
});
