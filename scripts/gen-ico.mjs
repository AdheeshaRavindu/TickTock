/**
 * Creates a minimal but valid .ico file from a PNG using sharp.
 * An ICO file is a binary format with a header + directory + image data.
 * We embed a 32x32 and 16x16 PNG-compressed frame.
 */
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = 'C:/Users/Admin/.gemini/antigravity/brain/8ca15205-3d38-43c7-959c-d6aab9de17f9/app_icon_1772621671498.png';
const DEST = join(__dirname, '..', 'src-tauri', 'icons', 'icon.ico');

mkdirSync(join(__dirname, '..', 'src-tauri', 'icons'), { recursive: true });

// Generate PNG buffers for each size
const sizes = [16, 32, 48, 256];
const pngBuffers = await Promise.all(
    sizes.map(s => sharp(SRC).resize(s, s).png().toBuffer())
);

// Build ICO binary
// ICO Header: 6 bytes
//   reserved (2), type=1 (2), count (2)
// ICO Directory entries: 16 bytes each
//   width(1), height(1), colorCount(1), reserved(1),
//   planes(2), bitCount(2), bytesInRes(4), imageOffset(4)
// Then raw PNG data for each image

const count = sizes.length;
const headerSize = 6;
const dirEntrySize = 16;
const dirSize = dirEntrySize * count;
const totalHeaderSize = headerSize + dirSize;

// Calculate total buffer size
let totalDataSize = 0;
for (const buf of pngBuffers) totalDataSize += buf.length;

const ico = Buffer.alloc(totalHeaderSize + totalDataSize);
let offset = 0;

// ICONDIR header
ico.writeUInt16LE(0, offset);           // reserved
ico.writeUInt16LE(1, offset + 2);       // type: 1 = ICO
ico.writeUInt16LE(count, offset + 4);   // image count
offset += 6;

// Directory entries
let dataOffset = totalHeaderSize;
for (let i = 0; i < count; i++) {
    const size = sizes[i];
    const buf = pngBuffers[i];
    // width/height: 0 means 256 in ICO spec
    ico.writeUInt8(size >= 256 ? 0 : size, offset);      // width
    ico.writeUInt8(size >= 256 ? 0 : size, offset + 1);  // height
    ico.writeUInt8(0, offset + 2);                        // color count (0=truecolor)
    ico.writeUInt8(0, offset + 3);                        // reserved
    ico.writeUInt16LE(1, offset + 4);                     // planes
    ico.writeUInt16LE(32, offset + 6);                    // bit count
    ico.writeUInt32LE(buf.length, offset + 8);            // bytes in resource
    ico.writeUInt32LE(dataOffset, offset + 12);           // offset to image data
    offset += 16;
    dataOffset += buf.length;
}

// Image data
for (const buf of pngBuffers) {
    buf.copy(ico, offset);
    offset += buf.length;
}

writeFileSync(DEST, ico);
console.log(`✓ icon.ico written (${sizes.join(', ')}px frames, ${ico.length} bytes)`);
