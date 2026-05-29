#!/usr/bin/env node
/**
 * 从 favicon.svg 生成项目所需的所有 PNG/ICO 图标。
 * 依赖: sharp (npm install sharp)
 * 用法: node scripts/generate-icons.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const playerDir = resolve(root, 'songloft-player');
const buildDir = resolve(root, 'songloft-player-build/web-embedded');

const svgPath = resolve(playerDir, 'web/favicon.svg');
const svgBuffer = readFileSync(svgPath);

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('Error: sharp not found. Run: npm install sharp');
  process.exit(1);
}

async function renderPng(size) {
  return sharp(svgBuffer, { density: Math.round(72 * size / 512) * 4 })
    .resize(size, size)
    .png()
    .toBuffer();
}

async function renderIco(sizes) {
  // ICO = BMP header per image; simplest approach: use PNG-in-ICO (modern ICO)
  const buffers = await Promise.all(sizes.map(s => renderPng(s)));
  // Build ICO file manually (PNG variant)
  const numImages = buffers.length;
  const headerSize = 6 + numImages * 16;
  let offset = headerSize;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // ICO type
  header.writeUInt16LE(numImages, 4);
  for (let i = 0; i < numImages; i++) {
    const size = sizes[i] >= 256 ? 0 : sizes[i];
    const entryOff = 6 + i * 16;
    header.writeUInt8(size, entryOff);         // width
    header.writeUInt8(size, entryOff + 1);     // height
    header.writeUInt8(0, entryOff + 2);        // color palette
    header.writeUInt8(0, entryOff + 3);        // reserved
    header.writeUInt16LE(1, entryOff + 4);     // color planes
    header.writeUInt16LE(32, entryOff + 6);    // bits per pixel
    header.writeUInt32LE(buffers[i].length, entryOff + 8);   // size
    header.writeUInt32LE(offset, entryOff + 12);             // offset
    offset += buffers[i].length;
  }
  return Buffer.concat([header, ...buffers]);
}

const tasks = [
  // Web favicons
  { size: 192, out: `${playerDir}/web/icons/Icon-192.png` },
  { size: 512, out: `${playerDir}/web/icons/Icon-512.png` },
  { size: 192, out: `${playerDir}/web/icons/Icon-maskable-192.png` },
  { size: 512, out: `${playerDir}/web/icons/Icon-maskable-512.png` },
  { size: 64,  out: `${playerDir}/web/favicon.png` },
  // App icon source
  { size: 1024, out: `${playerDir}/assets/icons/app_icon.png` },
  // Web embedded build
  { size: 192, out: `${buildDir}/icons/Icon-192.png` },
  { size: 512, out: `${buildDir}/icons/Icon-512.png` },
  { size: 192, out: `${buildDir}/icons/Icon-maskable-192.png` },
  { size: 512, out: `${buildDir}/icons/Icon-maskable-512.png` },
  { size: 64,  out: `${buildDir}/favicon.png` },
  // iOS icons
  ...([20,29,40,58,60,76,80,87,120,152,167,180,1024].map(size => ({
    size,
    out: `${playerDir}/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-${size}x${size}.png`
  }))),
  // macOS icons
  ...[16,32,64,128,256,512,1024].map(size => ({
    size,
    out: `${playerDir}/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_${size}.png`
  })),
];

// iOS needs specific naming convention - fix the naming
const iosMapping = [
  { size: 40,  name: 'Icon-App-20x20@2x.png' },
  { size: 20,  name: 'Icon-App-20x20@1x.png' },
  { size: 60,  name: 'Icon-App-20x20@3x.png' },
  { size: 29,  name: 'Icon-App-29x29@1x.png' },
  { size: 58,  name: 'Icon-App-29x29@2x.png' },
  { size: 87,  name: 'Icon-App-29x29@3x.png' },
  { size: 40,  name: 'Icon-App-40x40@1x.png' },
  { size: 80,  name: 'Icon-App-40x40@2x.png' },
  { size: 120, name: 'Icon-App-40x40@3x.png' },
  { size: 120, name: 'Icon-App-60x60@2x.png' },
  { size: 180, name: 'Icon-App-60x60@3x.png' },
  { size: 76,  name: 'Icon-App-76x76@1x.png' },
  { size: 152, name: 'Icon-App-76x76@2x.png' },
  { size: 167, name: 'Icon-App-83.5x83.5@2x.png' },
  { size: 1024, name: 'Icon-App-1024x1024@1x.png' },
];

const iosDir = `${playerDir}/ios/Runner/Assets.xcassets/AppIcon.appiconset`;

console.log('Generating icons from favicon.svg...\n');

// Generate standard tasks (web + macOS + app_icon)
const filteredTasks = tasks.filter(t => !t.out.includes('/ios/'));
for (const { size, out } of filteredTasks) {
  const buf = await renderPng(size);
  const { writeFileSync } = await import('fs');
  writeFileSync(out, buf);
  console.log(`  ✓ ${size}x${size} → ${out.replace(root + '/', '')}`);
}

// Generate iOS icons with correct naming
for (const { size, name } of iosMapping) {
  const buf = await renderPng(size);
  const { writeFileSync } = await import('fs');
  writeFileSync(`${iosDir}/${name}`, buf);
  console.log(`  ✓ ${size}x${size} → songloft-player/ios/.../AppIcon.appiconset/${name}`);
}

// Generate Windows ICO
const icoBuffer = await renderIco([16, 32, 48, 64, 128, 256]);
const { writeFileSync } = await import('fs');
writeFileSync(`${playerDir}/windows/runner/resources/app_icon.ico`, icoBuffer);
console.log(`  ✓ ICO (16-256) → songloft-player/windows/runner/resources/app_icon.ico`);

console.log('\nDone! All icons generated.');
