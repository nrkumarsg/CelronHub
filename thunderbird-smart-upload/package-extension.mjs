// Packages dist/ into celron-smart-upload.xpi.
//
// IMPORTANT: zip entry names must use forward slashes regardless of host OS.
// The previously-shipped .xpi was built with backslash-separated entry names
// (e.g. "assets\popup.js" instead of "assets/popup.js") — both the old
// hand-zipped build and Windows PowerShell's Compress-Archive on this
// machine produce backslash paths. That's invalid inside a WebExtension
// archive: Thunderbird resolves asset URLs with forward slashes, so every
// reference under assets/ silently 404'd and the popup never got past its
// static "Initializing..." placeholder (script-load failures don't surface
// via window.onerror, so it just hung with no visible error).
// `archiver`'s ZipArchive always writes POSIX-style forward-slash entry
// names, so it's safe to run from Windows.
import fs from 'fs';
import path from 'path';
import { ZipArchive } from 'archiver';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const outputPath = path.join(rootDir, 'celron-smart-upload.xpi');

if (!fs.existsSync(distDir)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const output = fs.createWriteStream(outputPath);
const archive = new ZipArchive({ zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Packaged ${archive.pointer()} bytes into ${path.basename(outputPath)}`);
});

archive.on('warning', (err) => console.warn(err));
archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);
archive.directory(distDir, false);
archive.finalize();
