import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { imageContent } from "../../src/image.mjs";

test("imageContent attaches small images and only names big ones", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mi-image-"));
  try {
    const file = path.join(dir, "a.png");
    writeFileSync(file, Buffer.alloc(1000, 7));

    const small = await imageContent(file, 2000);
    assert.equal(small.length, 1);
    assert.deepEqual([small[0].type, small[0].mimeType], ["image", "image/png"]);
    assert.equal(Buffer.from(small[0].data, "base64").length, 1000);

    const big = await imageContent(file, 500);
    assert.equal(big.length, 1);
    assert.equal(big[0].type, "text");
    assert.ok(big[0].text.includes(file));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
