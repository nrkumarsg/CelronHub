import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');

console.log('Building Thunderbird WebExtension bundle...');
execSync('npx vite build', { stdio: 'inherit', cwd: rootDir });

// Post-processing popup HTML files to ensure compatibility with Thunderbird extension popups
for (const htmlFile of ['index.html', 'triage.html']) {
  const htmlPath = path.join(distDir, htmlFile);
  if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf-8');
    html = html.replace(/\s+crossorigin=""/g, '');
    html = html.replace(/\s+crossorigin/g, '');
    fs.writeFileSync(htmlPath, html, 'utf-8');
    console.log(`Successfully patched dist/${htmlFile} for Thunderbird WebExtension compatibility!`);
  }
}

// Copy manifest.json to dist/
const manifestSrc = path.join(rootDir, 'manifest.json');
const manifestDist = path.join(distDir, 'manifest.json');
fs.copyFileSync(manifestSrc, manifestDist);

// Copy icons directory to dist/icons
const iconsSrc = path.join(rootDir, 'public', 'icons');
const iconsDist = path.join(distDir, 'icons');
if (!fs.existsSync(iconsDist)) {
  fs.mkdirSync(iconsDist, { recursive: true });
}
if (fs.existsSync(iconsSrc)) {
  fs.readdirSync(iconsSrc).forEach(file => {
    fs.copyFileSync(path.join(iconsSrc, file), path.join(iconsDist, file));
  });
}
// Copy assets directory from public/assets to dist/assets
const assetsSrc = path.join(rootDir, 'public', 'assets');
const assetsDist = path.join(distDir, 'assets');
if (!fs.existsSync(assetsDist)) {
  fs.mkdirSync(assetsDist, { recursive: true });
}
if (fs.existsSync(assetsSrc)) {
  fs.readdirSync(assetsSrc).forEach(file => {
    fs.copyFileSync(path.join(assetsSrc, file), path.join(assetsDist, file));
  });
}

console.log('Thunderbird Extension Build Completed Successfully!');
