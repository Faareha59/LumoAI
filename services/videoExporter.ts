import { VideoDraft, Slide } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return 0;
  }
  const words = trimmed.split(/\s+/);
  let line = '';
  let lineCount = 0;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
      lineCount += 1;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trimEnd(), x, y);
  return (lineCount + 1) * lineHeight;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

const PDF_SNAPSHOT_WIDTH = 520;

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function loadPdfDocumentFromDraft(draft: VideoDraft): Promise<pdfjsLib.PDFDocumentProxy | null> {
  if (!draft.pdfDocumentBase64) return null;
  try {
    const data = base64ToUint8Array(draft.pdfDocumentBase64);
    const loadingTask = pdfjsLib.getDocument({ data, useSystemFonts: true });
    const pdf = await loadingTask.promise;
    return pdf;
  } catch (err) {
    console.warn('Unable to load PDF for slide snapshots:', err);
    return null;
  }
}

/**
 * Polyfill for roundRect which is missing in some older browsers
 */
function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number | number[]) {
  if (typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x, y, width, height, radius);
    return;
  }

  // Basic fallback if roundRect is missing
  let r = 0;
  if (Array.isArray(radius)) r = radius[0] || 0;
  else r = radius;

  if (width < 2 * r) r = width / 2;
  if (height < 2 * r) r = height / 2;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export async function renderPdfPageToDataUrl(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  targetWidth = PDF_SNAPSHOT_WIDTH
): Promise<string | null> {
  try {
    const clamped = Math.min(Math.max(1, Math.floor(pageNumber)), pdf.numPages);
    const page = await pdf.getPage(clamped);
    const initialViewport = page.getViewport({ scale: 1 });
    const scale = targetWidth / initialViewport.width || 1;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      page.cleanup();
      return null;
    }
    if (viewport.width <= 0) {
      console.warn('Invalid PDF viewport width');
      return null;
    }
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/png');
    page.cleanup();
    return dataUrl;
  } catch (err) {
    console.error('Failed to render PDF page snapshot:', err);
    return null;
  }
}

async function getPdfSnapshotImage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  cache: Map<number, Promise<HTMLImageElement | null>>
): Promise<HTMLImageElement | null> {
  const clamped = Math.min(Math.max(1, Math.floor(pageNumber)), pdf.numPages);
  if (!cache.has(clamped)) {
    const promise = renderPdfPageToDataUrl(pdf, clamped).then((dataUrl) => {
      if (!dataUrl) return null;
      return loadImage(dataUrl).catch(() => null);
    });
    cache.set(clamped, promise);
  }
  return cache.get(clamped) ?? null;
}

function drawTechAccent(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const accentCount = 6;
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#60a5fa';
  for (let i = 0; i < accentCount; i += 1) {
    const radius = Math.min(width, height) * (0.15 + (i * 0.08));
    ctx.beginPath();
    ctx.arc(width - radius / 2 - 40, radius / 1.8, radius, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#38bdf8';
  for (let i = 0; i < 80; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

function drawBulletList(
  ctx: CanvasRenderingContext2D,
  items: string[],
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  bulletColor = '#6366f1'
) {
  let offset = 0;
  const bulletRadius = 6;
  const bulletGap = 18;
  const textStart = x + bulletRadius * 2 + bulletGap;

  ctx.textBaseline = 'top';
  ctx.font = '500 28px "Segoe UI", system-ui, -apple-system, sans-serif';
  const textColor = ctx.fillStyle;

  items.forEach((item) => {
    const text = (item || '').trim();
    if (!text) return;

    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    if (!lines.length) return;

    lines.forEach((line, lineIdx) => {
      const lineY = y + offset + lineIdx * lineHeight;
      if (lineIdx === 0) {
        ctx.save();
        ctx.fillStyle = bulletColor;
        ctx.beginPath();
        ctx.arc(x + bulletRadius, lineY + lineHeight / 2 - 2, bulletRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.fillStyle = textColor;
      ctx.fillText(line, textStart, lineY);
    });

    offset += lineHeight * lines.length + 12;
  });

  return offset;
}

function drawKeywordChips(
  ctx: CanvasRenderingContext2D,
  keywords: string[],
  x: number,
  y: number,
  maxWidth: number,
  gradientOverride?: [string, string],
  textColorOverride?: string
) {
  if (!keywords.length) return;

  const chipHeight = 34;
  let currentX = x;
  let currentY = y;

  ctx.textBaseline = 'middle';
  ctx.font = '600 18px "Segoe UI", system-ui, -apple-system, sans-serif';

  keywords.slice(0, 6).forEach((keyword) => {
    const label = keyword.toUpperCase();
    const textWidth = ctx.measureText(label).width;
    const chipWidth = textWidth + 28;

    if (currentX + chipWidth > x + maxWidth) {
      currentX = x;
      currentY += chipHeight + 10;
    }

    const gradient = ctx.createLinearGradient(currentX, currentY, currentX + chipWidth, currentY + chipHeight);
    const gradientStart = gradientOverride?.[0] ?? 'rgba(99, 102, 241, 0.55)';
    const gradientEnd = gradientOverride?.[1] ?? 'rgba(129, 140, 248, 0.8)';
    gradient.addColorStop(0, gradientStart);
    gradient.addColorStop(1, gradientEnd);

    ctx.save();
    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, currentX, currentY, chipWidth, chipHeight, 999);
    ctx.fill();

    ctx.fillStyle = textColorOverride ?? 'rgba(15, 23, 42, 0.85)';
    ctx.fillText(label, currentX + chipWidth / 2, currentY + chipHeight / 2);
    ctx.restore();

    currentX += chipWidth + 12;
  });
}

function drawSidebarRibbons(ctx: CanvasRenderingContext2D, tags: string[], width: number, height: number) {
  const sidebarWidth = width * 0.26;
  const sidebarX = width - sidebarWidth - 64;
  const baseY = height * 0.22;
  const ribbonHeight = 56;

  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#1e3a8a';
  drawRoundedRect(ctx, sidebarX - 12, baseY - 40, sidebarWidth + 24, ribbonHeight * tags.length + 80, 28);
  ctx.fill();
  ctx.restore();

  ctx.font = '600 22px "Segoe UI", system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'middle';

  tags.slice(0, 5).forEach((tag, idx) => {
    const y = baseY + idx * ribbonHeight;
    const hue = (idx * 55) % 360;
    const gradient = ctx.createLinearGradient(sidebarX, y, sidebarX + sidebarWidth, y + ribbonHeight);
    gradient.addColorStop(0, `hsla(${hue}, 70%, 55%, 0.9)`);
    gradient.addColorStop(1, `hsla(${(hue + 25) % 360}, 75%, 65%, 0.65)`);

    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, sidebarX, y, sidebarWidth, ribbonHeight - 12, 18);
    ctx.fill();

    ctx.fillStyle = 'rgba(15,23,42,0.92)';
    ctx.fillText(tag.toUpperCase(), sidebarX + 24, y + (ribbonHeight - 12) / 2);
  });
}

function drawCodeSnippet(
  ctx: CanvasRenderingContext2D,
  code: string,
  language: string | undefined,
  x: number,
  y: number,
  width: number,
  maxHeight: number,
  theme: ThemeStyle
) {
  const lines = code.split(/\r?\n/).map((line) => line.replace(/\t/g, '  '));
  if (!lines.length) return;

  const lineHeight = 30;
  const padding = 20;
  const headerHeight = language ? 38 : 0;
  const contentHeight = Math.min(lines.length * lineHeight, maxHeight - padding * 2 - headerHeight);
  const blockHeight = contentHeight + padding * 2 + headerHeight;

  ctx.save();
  ctx.fillStyle = 'rgba(8, 13, 28, 0.92)';
  ctx.shadowColor = 'rgba(8, 13, 28, 0.35)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 14;
  drawRoundedRect(ctx, x, y, width, blockHeight, 18);
  ctx.fill();

  ctx.strokeStyle = theme.mediaBorder[0];
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, x, y, width, blockHeight, 18);
  ctx.stroke();

  ctx.restore();

  if (language) {
    ctx.save();
    ctx.fillStyle = theme.chipGradient[0];
    drawRoundedRect(ctx, x + padding / 2, y + padding / 2, 120, headerHeight - padding / 2, 12);
    ctx.fill();
    ctx.fillStyle = theme.chipText;
    ctx.font = '600 18px "JetBrains Mono", "Fira Code", "Consolas", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(language.toUpperCase(), x + padding, y + headerHeight / 2 + padding / 4);
    ctx.restore();
  }

  ctx.save();
  ctx.font = '500 20px "JetBrains Mono", "Fira Code", "Consolas", monospace';
  ctx.fillStyle = '#e2e8f0';
  ctx.textBaseline = 'top';
  const contentY = y + padding * 1.2 + headerHeight;
  const maxLines = Math.floor(contentHeight / lineHeight);
  lines.slice(0, maxLines).forEach((line, idx) => {
    const textY = contentY + idx * lineHeight;
    const availableWidth = width - padding * 2;
    let rendered = '';
    for (const char of line) {
      const test = rendered + char;
      if (ctx.measureText(test).width > availableWidth) break;
      rendered = test;
    }
    ctx.fillText(rendered, x + padding, textY);
  });
  ctx.restore();
}

function drawPdfExcerpt(
  ctx: CanvasRenderingContext2D,
  excerpt: string,
  page: number | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  theme: ThemeStyle
) {
  if (!excerpt.trim()) return 0;

  const padding = 20;
  const headerHeight = 30;
  const lineHeight = 26;

  ctx.save();
  ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
  drawRoundedRect(ctx, x, y, width, height, 18);
  ctx.fill();

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x, y, width, height, 18);
  ctx.stroke();
  ctx.restore();

  const label = page ? `PDF Page ${page}` : 'PDF Reference';
  ctx.save();
  ctx.font = '600 17px "Segoe UI", system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.headingLabel;
  ctx.fillText(label, x + padding, y + headerHeight / 2 + 4);
  ctx.restore();

  ctx.save();
  ctx.font = '400 19px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = theme.summaryText;

  const lines: string[] = [];
  const words = excerpt.replace(/\s+/g, ' ').trim().split(' ');
  let current = '';
  words.forEach((word) => {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > width - padding * 2) {
      if (current) {
        lines.push(current);
        current = word;
      } else {
        lines.push(test);
        current = '';
      }
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);

  const maxLines = Math.max(1, Math.floor((height - padding - headerHeight) / lineHeight));
  lines.slice(0, maxLines).forEach((line, idx) => {
    ctx.fillText(line, x + padding, y + headerHeight + padding / 2 + idx * lineHeight);
  });
  ctx.restore();

  return height;
}

function drawPdfSnapshot(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  page: number | undefined,
  x: number,
  y: number,
  width: number,
  maxHeight: number,
  theme: ThemeStyle
) {
  const aspect = image.height / Math.max(image.width, 1);
  const targetHeight = Math.min(maxHeight, width * aspect);
  const radius = 24;

  ctx.save();
  drawRoundedRect(ctx, x, y, width, targetHeight, radius);
  ctx.clip();

  const coverScale = Math.max(width / image.width, targetHeight / image.height);
  const drawWidth = image.width * coverScale;
  const drawHeight = image.height * coverScale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (targetHeight - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  ctx.restore();

  ctx.save();
  const stroke = ctx.createLinearGradient(x, y, x + width, y + targetHeight);
  stroke.addColorStop(0, theme.cardStroke[0]);
  stroke.addColorStop(1, theme.cardStroke[1]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  drawRoundedRect(ctx, x, y, width, targetHeight, radius);
  ctx.stroke();
  ctx.restore();

  if (page) {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    drawRoundedRect(ctx, x + 18, y + 18, 140, 40, 14);
    ctx.fill();
    ctx.font = '600 17px "Segoe UI", system-ui, -apple-system, sans-serif';
    ctx.fillStyle = theme.headingLabel;
    ctx.textBaseline = 'middle';
    ctx.fillText(`PDF · Page ${page}`, x + 32, y + 38);
    ctx.restore();
  }

  return targetHeight;
}

type ThemeStyle = {
  background: [string, string];
  overlay: [string, string];
  cardFill: string;
  cardStroke: [string, string];
  headingLabel: string;
  headingText: string;
  summaryText: string;
  bulletColor: string;
  chipGradient: [string, string];
  chipText: string;
  progressTrack: string;
  progressFill: string;
  mediaBorder: [string, string];
  shadow: string;
};

const BASE_THEME_STYLE: ThemeStyle = {
  background: ['#0b1220', '#111c36'],
  overlay: ['rgba(15, 23, 42, 0.88)', 'rgba(15, 23, 42, 0.45)'],
  cardFill: 'rgba(13, 20, 36, 0.9)',
  cardStroke: ['rgba(99, 102, 241, 0.25)', 'rgba(59, 130, 246, 0.08)'],
  headingLabel: '#a5b4fc',
  headingText: '#f8fafc',
  summaryText: '#d0d6f7',
  bulletColor: '#6366f1',
  chipGradient: ['rgba(99, 102, 241, 0.55)', 'rgba(129, 140, 248, 0.8)'],
  chipText: 'rgba(15, 23, 42, 0.85)',
  progressTrack: 'rgba(148, 163, 184, 0.25)',
  progressFill: 'rgba(99, 102, 241, 0.9)',
  mediaBorder: ['rgba(129, 140, 248, 0.8)', 'rgba(96, 165, 250, 0.6)'],
  shadow: 'rgba(8, 13, 28, 0.55)',
};

const THEME_STYLES: Record<string, ThemeStyle> = {
  'data-structures': {
    ...BASE_THEME_STYLE,
    background: ['#051320', '#06263b'],
    overlay: ['rgba(8, 25, 42, 0.9)', 'rgba(8, 25, 42, 0.55)'],
    headingLabel: '#5eead4',
    headingText: '#ecfeff',
    summaryText: '#ccfbf1',
    bulletColor: '#2dd4bf',
    chipGradient: ['rgba(34, 211, 238, 0.6)', 'rgba(14, 165, 233, 0.75)'],
    progressFill: 'rgba(34, 211, 238, 0.9)',
    mediaBorder: ['rgba(45, 212, 191, 0.9)', 'rgba(59, 130, 246, 0.6)'],
  },
  algorithms: {
    ...BASE_THEME_STYLE,
    background: ['#12061f', '#22073a'],
    headingLabel: '#f472b6',
    headingText: '#fdf4ff',
    summaryText: '#f9a8d4',
    bulletColor: '#ec4899',
    chipGradient: ['rgba(244, 114, 182, 0.65)', 'rgba(236, 72, 153, 0.75)'],
    progressFill: 'rgba(236, 72, 153, 0.9)',
    mediaBorder: ['rgba(236, 72, 153, 0.85)', 'rgba(168, 85, 247, 0.6)'],
  },
  programming: {
    ...BASE_THEME_STYLE,
    background: ['#030617', '#050b27'],
    headingLabel: '#38bdf8',
    headingText: '#e0f2fe',
    summaryText: '#bae6fd',
    bulletColor: '#0ea5e9',
    chipGradient: ['rgba(14, 165, 233, 0.6)', 'rgba(59, 130, 246, 0.7)'],
    progressFill: 'rgba(14, 165, 233, 0.9)',
    mediaBorder: ['rgba(14, 165, 233, 0.85)', 'rgba(2, 132, 199, 0.7)'],
  },
  parallelism: {
    ...BASE_THEME_STYLE,
    background: ['#071225', '#0b1f3f'],
    headingLabel: '#facc15',
    headingText: '#fef08a',
    summaryText: '#fde68a',
    bulletColor: '#fbbf24',
    chipGradient: ['rgba(250, 204, 21, 0.6)', 'rgba(253, 224, 71, 0.65)'],
    chipText: 'rgba(30, 41, 59, 0.85)',
    progressFill: 'rgba(250, 204, 21, 0.9)',
    mediaBorder: ['rgba(250, 204, 21, 0.9)', 'rgba(251, 191, 36, 0.7)'],
  },
  security: {
    ...BASE_THEME_STYLE,
    background: ['#060c1a', '#0f1f2f'],
    headingLabel: '#f97316',
    headingText: '#ffedd5',
    summaryText: '#fed7aa',
    bulletColor: '#fb923c',
    chipGradient: ['rgba(249, 115, 22, 0.6)', 'rgba(251, 146, 60, 0.7)'],
    progressFill: 'rgba(249, 115, 22, 0.9)',
    mediaBorder: ['rgba(249, 115, 22, 0.85)', 'rgba(234, 88, 12, 0.65)'],
  },
  networks: {
    ...BASE_THEME_STYLE,
    background: ['#031314', '#052b36'],
    headingLabel: '#34d399',
    headingText: '#d1fae5',
    summaryText: '#bbf7d0',
    bulletColor: '#22c55e',
    chipGradient: ['rgba(52, 211, 153, 0.6)', 'rgba(16, 185, 129, 0.7)'],
    progressFill: 'rgba(16, 185, 129, 0.9)',
    mediaBorder: ['rgba(16, 185, 129, 0.85)', 'rgba(5, 150, 105, 0.7)'],
  },
  databases: {
    ...BASE_THEME_STYLE,
    background: ['#050b17', '#0b1931'],
    headingLabel: '#a78bfa',
    headingText: '#ede9fe',
    summaryText: '#ddd6fe',
    bulletColor: '#8b5cf6',
    chipGradient: ['rgba(167, 139, 250, 0.65)', 'rgba(139, 92, 246, 0.75)'],
    progressFill: 'rgba(139, 92, 246, 0.9)',
    mediaBorder: ['rgba(139, 92, 246, 0.85)', 'rgba(55, 48, 163, 0.7)'],
  },
  'ai-ml': {
    ...BASE_THEME_STYLE,
    background: ['#0c0418', '#160433'],
    headingLabel: '#f0abfc',
    headingText: '#fae8ff',
    summaryText: '#f5d0fe',
    bulletColor: '#d946ef',
    chipGradient: ['rgba(240, 171, 252, 0.6)', 'rgba(217, 70, 239, 0.75)'],
    progressFill: 'rgba(217, 70, 239, 0.9)',
    mediaBorder: ['rgba(217, 70, 239, 0.85)', 'rgba(147, 51, 234, 0.65)'],
  },
  'software-engineering': {
    ...BASE_THEME_STYLE,
    background: ['#0a0c1b', '#141a33'],
    headingLabel: '#fcd34d',
    headingText: '#fef3c7',
    summaryText: '#fde68a',
    bulletColor: '#f59e0b',
    chipGradient: ['rgba(252, 211, 77, 0.6)', 'rgba(251, 191, 36, 0.7)'],
    progressFill: 'rgba(245, 158, 11, 0.9)',
    mediaBorder: ['rgba(245, 158, 11, 0.85)', 'rgba(217, 119, 6, 0.65)'],
  },
  'computer-architecture': {
    ...BASE_THEME_STYLE,
    background: ['#090412', '#17092d'],
    headingLabel: '#60a5fa',
    headingText: '#dbeafe',
    summaryText: '#bfdbfe',
    bulletColor: '#3b82f6',
    chipGradient: ['rgba(96, 165, 250, 0.6)', 'rgba(59, 130, 246, 0.7)'],
    progressFill: 'rgba(59, 130, 246, 0.9)',
    mediaBorder: ['rgba(59, 130, 246, 0.85)', 'rgba(37, 99, 235, 0.65)'],
  },
  'operating-systems': {
    ...BASE_THEME_STYLE,
    background: ['#040f14', '#0a1f2b'],
    headingLabel: '#67e8f9',
    headingText: '#ecfeff',
    summaryText: '#cffafe',
    bulletColor: '#22d3ee',
    chipGradient: ['rgba(103, 232, 249, 0.6)', 'rgba(6, 182, 212, 0.7)'],
    progressFill: 'rgba(6, 182, 212, 0.9)',
    mediaBorder: ['rgba(6, 182, 212, 0.85)', 'rgba(14, 165, 233, 0.65)'],
  },
  'blackboard': {
    ...BASE_THEME_STYLE,
    background: ['#0f172a', '#020617'],
    overlay: ['rgba(15, 23, 42, 0.4)', 'rgba(2, 6, 23, 0.7)'],
    cardFill: 'transparent',
    cardStroke: ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0)'],
    headingLabel: '#38bdf8',
    headingText: '#ffffff',
    summaryText: '#94a3b8',
    bulletColor: '#38bdf8',
    chipGradient: ['#38bdf8', '#0ea5e9'],
    progressFill: '#38bdf8',
    mediaBorder: ['rgba(56, 189, 248, 0.5)', 'rgba(56, 189, 248, 0.2)'],
  },
};

export const getThemeStyle = (theme?: string): ThemeStyle => {
  if (!theme) return BASE_THEME_STYLE;
  return THEME_STYLES[theme] ?? BASE_THEME_STYLE;
};

export function drawSlide(
  ctx: CanvasRenderingContext2D,
  slide: Slide,
  backgroundImage: HTMLImageElement | null,
  snapshotImage: HTMLImageElement | null,
  width: number,
  height: number,
  slideIndex: number,
  totalSlides: number,
  progress: number,
  showCaption = true
) {
  const themeStyle = getThemeStyle(slide.visualTheme || 'blackboard');

  // Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, themeStyle.background[0]);
  bgGrad.addColorStop(1, themeStyle.background[1]);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Smooth Easing
  const easeInOut = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  const easedProg = easeInOut(progress);

  // Background Abstract Shapes (Floating & Slow)
  ctx.save();
  const shapeOpacity = 0.15 + Math.sin(progress * Math.PI) * 0.05;
  ctx.globalAlpha = shapeOpacity;
  const drift = easedProg * 35;

  ctx.fillStyle = themeStyle.progressFill;
  // Top Shape
  ctx.beginPath();
  ctx.arc(width * 0.88, -120 + drift, 360, 0, Math.PI);
  ctx.fill();

  // Bottom Shape
  ctx.beginPath();
  ctx.arc(width * 0.12, height + 120 - drift, 360, Math.PI, 0);
  ctx.fill();
  ctx.restore();

  if (backgroundImage) {
    ctx.save();
    ctx.globalAlpha = 0.15;
    const zoom = 1 + progress * 0.04;
    ctx.drawImage(backgroundImage, (width - width * zoom) / 2, (height - height * zoom) / 2, width * zoom, height * zoom);
    ctx.restore();
  }

  const hasSecondaryContent = !!(slide.codeSnippet || snapshotImage || slide.pdfExcerpt || (slide.keywords && slide.keywords.length > 0));
  const centerX = width / 2;
  const padding = 110;

  if (!hasSecondaryContent) {
    // Cinematic Centered Layout (Like an Intro/Outro)
    const titleMaxWidth = width * 0.85;
    const titleY = height * 0.42;

    ctx.save();
    const titleAlpha = Math.min(0.2 + progress * 4, 1);
    ctx.globalAlpha = titleAlpha;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const heading = slide.heading || 'Subject Matter';
    const titleFontSize = heading.length > 45 ? 42 : 64;
    ctx.font = `700 ${titleFontSize}px "Inter", "Segoe UI", sans-serif`;

    wrapText(ctx, heading, centerX, titleY, titleMaxWidth, titleFontSize * 1.3);
    ctx.restore();
  } else {
    // Two-Column Split Layout
    const leftMargin = padding + 10;
    const contentWidth = width * 0.48;
    const secondaryWidth = width * 0.42;
    const rightX = width - secondaryWidth - padding;

    // Title at Top Left
    ctx.save();
    const titleAlpha = Math.min(0.3 + progress * 3, 1);
    ctx.globalAlpha = titleAlpha;
    ctx.fillStyle = themeStyle.headingLabel;
    ctx.font = '600 20px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('TOPIC OVERVIEW', leftMargin, padding);

    ctx.fillStyle = '#ffffff';
    const heading = slide.heading || 'Subject Matter';
    const titleFontSize = heading.length > 30 ? 44 : 56;
    ctx.font = `800 ${titleFontSize}px "Inter", "Segoe UI", sans-serif`;
    const titleY = padding + 70;
    const headingLines = wrapText(ctx, heading, leftMargin, titleY, contentWidth, titleFontSize * 1.2);
    ctx.restore();

    // Space reserved for heading only to keep video clean
    ctx.restore();

    // Secondary Content (Right Column)
    const secondaryY = padding + 20;

    if (snapshotImage) {
      drawPdfSnapshot(ctx, snapshotImage, slide.pdfPage, rightX, secondaryY, secondaryWidth, height * 0.55, themeStyle);
    } else if (slide.codeSnippet) {
      drawCodeSnippet(ctx, slide.codeSnippet, slide.snippetLanguage, rightX, secondaryY, secondaryWidth, height * 0.7, themeStyle);
    }

    // Sidebar tags / keywords
    if (slide.keywords && slide.keywords.length > 0) {
      const keywordsY = snapshotImage ? secondaryY + height * 0.58 : (slide.codeSnippet ? secondaryY + height * 0.73 : secondaryY + 20);
      drawKeywordChips(ctx, slide.keywords, rightX, keywordsY, secondaryWidth);
      drawSidebarRibbons(ctx, slide.keywords, width, height);
    }

    // Caption Overlay (Bottom Centered) - Optional
    const captionText = (slide.description || '').trim();
    if (captionText && showCaption) {
      ctx.save();
      const capFontSize = 32;
      ctx.font = `600 ${capFontSize}px "Inter", "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';

      const maxWidth = width * 0.8;
      const metrics = ctx.measureText(captionText);
      const textWidth = Math.min(metrics.width, maxWidth);
      const bgWidth = textWidth + 60;
      const bgHeight = 60;
      const bgX = (width - bgWidth) / 2;
      const bgY = height - 120;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      drawRoundedRect(ctx, bgX, bgY, bgWidth, bgHeight, 15);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(captionText, width / 2, bgY + bgHeight / 2 + 10);
      ctx.restore();
    }
  }

  // Fine Progress Line 
  const completedWidth = ((slideIndex + progress) / totalSlides) * width;
  ctx.fillStyle = themeStyle.progressFill;
  ctx.fillRect(0, height - 6, completedWidth, 6);
}

export async function exportLectureToWebM(draft: VideoDraft, opts?: { width?: number; height?: number; fps?: number; defaultSlideDurationMs?: number; startOffset?: number }): Promise<Blob> {
  const width = opts?.width ?? 1280;
  const height = opts?.height ?? 720;
  const fps = opts?.fps ?? 30;
  const defaultDur = opts?.defaultSlideDurationMs ?? 2200;
  const startOffset = opts?.startOffset || 0;

  const pdfDocument = await loadPdfDocumentFromDraft(draft);
  const pdfSnapshotCache = pdfDocument ? new Map<number, Promise<HTMLImageElement | null>>() : null;
  const totalPdfPages = pdfDocument?.numPages ?? 0;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported');

  const canvasStream = (canvas as HTMLCanvasElement).captureStream(fps);
  const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtx();
  const dest = audioCtx.createMediaStreamDestination();
  const mixed = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);

  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : 'video/webm;codecs=vp8,opus';
  const recorder = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  recorder.start();

  for (let slideIndex = 0; slideIndex < draft.slides.length; slideIndex += 1) {
    const slide = draft.slides[slideIndex];
    const resolvedPdfPage = pdfDocument
      ? (typeof slide.pdfPage === 'number' && slide.pdfPage >= 1
        ? slide.pdfPage
        : (totalPdfPages ? (((startOffset + slideIndex) % totalPdfPages) + 1) : undefined))
      : (typeof slide.pdfPage === 'number' && slide.pdfPage >= 1 ? slide.pdfPage : undefined);

    const slideForRender = (resolvedPdfPage && resolvedPdfPage !== slide.pdfPage)
      ? { ...slide, pdfPage: resolvedPdfPage }
      : slide;

    let backgroundImage: HTMLImageElement | null = null;
    if (slide.imageUrl) {
      try { backgroundImage = await loadImage(slide.imageUrl); } catch { }
    }

    // Prepare audio and duration
    let audio: HTMLAudioElement | null = null;
    let audioDurationMs = defaultDur;

    if (slide.audioUrl) {
      try {
        audio = new Audio(slide.audioUrl);
        audio.crossOrigin = 'anonymous';
        const source = audioCtx.createMediaElementSource(audio);
        source.connect(dest);

        // Resume context in case browser policy blocked it
        if (audioCtx.state === 'suspended') await audioCtx.resume();

        // Wait for metadata to get real duration if possible
        await new Promise<void>((resolve) => {
          audio!.onloadedmetadata = () => {
            audioDurationMs = (audio!.duration * 1000) || defaultDur;
            resolve();
          };
          audio!.onerror = () => resolve();
          setTimeout(resolve, 1500); // Fail-safe
        });
      } catch (err) {
        console.warn('Audio setup failed for slide', slideIndex, err);
      }
    }

    const totalDurationMs = Math.max(defaultDur, audioDurationMs + 300);
    const frames = Math.max(1, Math.ceil(totalDurationMs / (1000 / fps)));

    // Start playing
    if (audio) {
      audio.play().catch(e => console.warn('Audio play error:', e));
    }

    // Drawing loop synchronized with duration
    const frameInterval = 1000 / fps;
    for (let i = 0; i < frames; i++) {
      const startTime = Date.now();
      const progress = i / (frames - 1 || 1);

      // PDF Snapshot if available
      let snapshotImg: HTMLImageElement | null = null;
      if (pdfDocument && resolvedPdfPage) {
        snapshotImg = await getPdfSnapshotImage(pdfDocument, resolvedPdfPage, pdfSnapshotCache!);
      }

      drawSlide(ctx, slideForRender, backgroundImage, snapshotImg, width, height, slideIndex, draft.slides.length, progress);

      const elapsed = Date.now() - startTime;
      await sleep(Math.max(1, frameInterval - elapsed));
    }

    if (audio) {
      audio.pause();
      audio.src = ''; // help GC
    }
  }

  try { pdfDocument?.destroy(); } catch { }

  await sleep(400); // Final buffer
  recorder.stop();

  const blob: Blob = await new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  try { audioCtx.close(); } catch { }
  return blob;
}
