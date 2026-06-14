// Polyfills for Vercel / Node.js Serverless environment to support pdfjs-dist
if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {};
}
if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {};
}
if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {};
}
console.log('[Polyfills] DOMMatrix, ImageData, Path2D polyfilled for server environment');
