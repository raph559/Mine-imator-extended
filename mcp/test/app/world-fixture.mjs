import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// A minimal Minecraft world writer for the tests: Anvil region files in the 1.18+ chunk format.
// Only what the app's importer reads is written.

const str = (s) => {
  const body = Buffer.from(s, "utf8");
  const len = Buffer.alloc(2);
  len.writeUInt16BE(body.length);
  return Buffer.concat([len, body]);
};
const i32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
};
const named = (type, name, payload) => Buffer.concat([Buffer.from([type]), str(name), payload]);
const end = Buffer.from([0]);

const byteTag = (name, v) => named(1, name, Buffer.from([v & 255]));
const intTag = (name, v) => named(3, name, i32(v));
const stringTag = (name, v) => named(8, name, str(v));
const compoundTag = (name, ...children) => named(10, name, Buffer.concat([...children, end]));
const compoundList = (name, items) => named(9, name, Buffer.concat([Buffer.from([10]), i32(items.length), ...items.map((children) => Buffer.concat([...children, end]))]));
const longArray = (name, longs) =>
  named(12, name, Buffer.concat([i32(longs.length), ...longs.map((l) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64BE(l);
    return b;
  })]));

/**
 * One 16x16x16 section. blocks(x, y, z) gives a block name (with "minecraft:") for each position, or null for air.
 * Indices are packed 4 bits each, 16 to a long, as 1.16 and later do.
 */
function section(y, blocks) {
  const palette = ["minecraft:air"];
  const indices = [];
  for (let by = 0; by < 16; by++)
    for (let bz = 0; bz < 16; bz++)
      for (let bx = 0; bx < 16; bx++) {
        const name = blocks(bx, by, bz) ?? "minecraft:air";
        if (!palette.includes(name)) palette.push(name);
        indices.push(palette.indexOf(name));
      }
  if (palette.length > 16) throw new Error("the fixture packs 4 bits per block");

  const longs = [];
  for (let i = 0; i < indices.length; i += 16) {
    let value = 0n;
    for (let k = 0; k < 16; k++) value |= BigInt(indices[i + k]) << BigInt(4 * k);
    longs.push(value);
  }
  return [
    byteTag("Y", y),
    compoundTag("block_states", compoundList("palette", palette.map((name) => [stringTag("Name", name)])), longArray("data", longs)),
  ];
}

function chunk(cx, cz, sections) {
  return Buffer.concat([
    compoundTag("", intTag("DataVersion", 3465), intTag("xPos", cx), intTag("zPos", cz), stringTag("Status", "minecraft:full"), compoundList("sections", sections), compoundList("block_entities", [])),
  ]);
}

/**
 * Writes <folder>/region/r.0.0.mca with the given chunks.
 * chunks: [{ cx, cz, sections: [{ y, blocks(x, y, z) }] }], chunk coordinates 0..31.
 */
export function writeWorld(folder, chunks) {
  const header = Buffer.alloc(8192);
  const bodies = [];
  let sector = 2;
  for (const { cx, cz, sections } of chunks) {
    const nbt = chunk(cx, cz, sections.map((s) => section(s.y, s.blocks)));
    const packed = deflateSync(nbt);
    const record = Buffer.alloc(5 + packed.length);
    record.writeUInt32BE(packed.length + 1, 0);
    record[4] = 2; // zlib
    packed.copy(record, 5);
    const sectors = Math.ceil(record.length / 4096);
    const padded = Buffer.alloc(sectors * 4096);
    record.copy(padded);

    const slot = ((cz << 5) + cx) * 4;
    header.writeUIntBE(sector, slot, 3);
    header[slot + 3] = sectors;
    bodies.push(padded);
    sector += sectors;
  }

  mkdirSync(`${folder}/region`, { recursive: true });
  writeFileSync(`${folder}/region/r.0.0.mca`, Buffer.concat([header, ...bodies]));
}
