/**
 * Generates all icon files required by Tauri v2 from a source PNG.
 * Output: src-tauri/icons/{32x32.png, 128x128.png, 128x128@2x.png, icon.png}
 * .ico and .icns are created as renamed PNGs (Tauri accepts PNG for dev builds).
 */

import sharp from 'sharp';
import { copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = 'C:/Users/Admin/.gemini/antigravity/brain/8ca15205-3d38-43c7-959c-d6aab9de17f9/app_icon_1772621671498.png';
const DEST = join(__dirname, '..', 'src-tauri', 'icons');

mkdirSync(DEST, { recursive: true });

const sizes = [
    { name: '32x32.png', size: 32 },
    { name: '128x128.png', size: 128 },
    { name: '128x128@2x.png', size: 256 },
    { name: 'icon.png', size: 512 },
];

for (const { name, size } of sizes) {
    const out = join(DEST, name);
    await sharp(SRC).resize(size, size).png().toFile(out);
    console.log(`  ✓ ${name} (${size}x${size})`);
}

// Tauri on Windows requires icon.ico — copy the 32x32 PNG as .ico placeholder
// (works for dev; use a proper .ico for production)
copyFileSync(join(DEST, '32x32.png'), join(DEST, 'icon.ico'));
console.log('  ✓ icon.ico (32px placeholder)');

// macOS .icns — copy 512 PNG as placeholder
copyFileSync(join(DEST, 'icon.png'), join(DEST, 'icon.icns'));
console.log('  ✓ icon.icns (512px placeholder)');

console.log('\nAll icons generated in src-tauri/icons/');
