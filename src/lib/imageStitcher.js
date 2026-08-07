/**
 * ImageStitcher - Client-side HTML5 Canvas Business Card Merging Module
 * Merges front and back business card images cleanly into a high-resolution composite card file.
 */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error('Failed to load image for stitching: ' + (err.message || src)));
    img.src = src;
  });
}

/**
 * Stitch Front and Back business card images into a unified composite image.
 * 
 * @param {string|Blob|File} frontSrc - Front image Base64 or Object URL
 * @param {string|Blob|File} [backSrc] - Back image Base64 or Object URL (optional)
 * @param {Object} [options] - Layout options
 * @returns {Promise<{ blob: Blob, dataUrl: string, filename: string }>}
 */
export async function stitchCardImages(frontSrc, backSrc = null, options = {}) {
  const {
    layout = 'vertical', // 'vertical' (stacked top & bottom default for easy mobile viewing) | 'side-by-side'
    padding = 24,
    gap = 20,
    headerHeight = 50,
    background = '#0f172a', // Dark theme background
    cardBorderColor = '#38bdf8', // Neon cyan border highlight
    companyName = '',
    contactName = ''
  } = options;

  let frontImg = null;
  let backImg = null;

  if (frontSrc) {
    const srcStr = typeof frontSrc === 'string' ? frontSrc : URL.createObjectURL(frontSrc);
    frontImg = await loadImage(srcStr);
  }

  if (backSrc) {
    const srcStr = typeof backSrc === 'string' ? backSrc : URL.createObjectURL(backSrc);
    backImg = await loadImage(srcStr);
  }

  if (!frontImg && !backImg) {
    throw new Error('At least one image source must be provided for card stitching.');
  }

  // If only one image is available, duplicate or render single card frame
  if (!backImg) {
    backImg = frontImg;
  }
  if (!frontImg) {
    frontImg = backImg;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Normalize image dimensions to target height 600px for crisp alignment
  const targetCardHeight = 600;
  const scaleFront = targetCardHeight / frontImg.height;
  const scaleBack = targetCardHeight / backImg.height;

  const w1 = Math.round(frontImg.width * scaleFront);
  const h1 = targetCardHeight;
  const w2 = Math.round(backImg.width * scaleBack);
  const h2 = targetCardHeight;

  let canvasWidth, canvasHeight;

  if (layout === 'side-by-side') {
    canvasWidth = padding * 2 + w1 + gap + w2;
    canvasHeight = padding * 2 + headerHeight + targetCardHeight;
  } else {
    // Stacked
    canvasWidth = padding * 2 + Math.max(w1, w2);
    canvasHeight = padding * 2 + headerHeight + h1 + gap + h2;
  }

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  // 1. Background Fill
  const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(1, '#1e293b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Header & Branding Banner
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('CEL-RON HUB | VERIFIED BUSINESS CARD PAIR', padding, padding + 28);

  if (companyName || contactName) {
    ctx.fillStyle = '#38bdf8';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'right';
    const titleText = [companyName, contactName].filter(Boolean).join(' • ');
    ctx.fillText(titleText, canvasWidth - padding, padding + 28);
  }

  // Divider Line
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding + headerHeight - 10);
  ctx.lineTo(canvasWidth - padding, padding + headerHeight - 10);
  ctx.stroke();

  // 3. Draw Front & Back Card Images with subtle shadows & rounded borders
  const drawCardFrame = (img, x, y, width, height, label) => {
    ctx.save();
    
    // Card Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 8;

    // Draw Card Background
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 12);
    ctx.fill();

    // Reset Shadow for image clip
    ctx.shadowColor = 'transparent';

    // Clip & Draw Image
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 12);
    ctx.clip();
    ctx.drawImage(img, x, y, width, height);
    ctx.restore();

    // Border Highlight
    ctx.strokeStyle = cardBorderColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 12);
    ctx.stroke();

    // Label Badge (FRONT / BACK)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(x + 12, y + 12, 90, 28, 6);
    ctx.fill();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + 57, y + 30);

    ctx.restore();
  };

  if (layout === 'side-by-side') {
    const frontX = padding;
    const frontY = padding + headerHeight;
    const backX = padding + w1 + gap;
    const backY = padding + headerHeight;

    drawCardFrame(frontImg, frontX, frontY, w1, h1, 'FRONT SIDE');
    drawCardFrame(backImg, backX, backY, w2, h2, 'BACK SIDE');
  } else {
    // Stacked
    const frontX = padding + Math.round((canvasWidth - padding * 2 - w1) / 2);
    const frontY = padding + headerHeight;
    const backX = padding + Math.round((canvasWidth - padding * 2 - w2) / 2);
    const backY = frontY + h1 + gap;

    drawCardFrame(frontImg, frontX, frontY, w1, h1, 'FRONT SIDE');
    drawCardFrame(backImg, backX, backY, w2, h2, 'BACK SIDE');
  }

  // Export to Blob and Data URL
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));

  // Build clean sanitized filename
  const cleanComp = (companyName || 'Card').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanContact = (contactName || 'Scanned').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${cleanComp}_${cleanContact}_merged.jpg`;

  return { blob, dataUrl, filename };
}
