import { VideoDraft, Slide } from '../types';

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
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

function drawSlide(ctx: CanvasRenderingContext2D, slide: Slide, image: HTMLImageElement | null, width: number, height: number) {
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, width, height);

  if (image) {
    const imgW = image.width;
    const imgH = image.height;
    const canvasRatio = width / height;
    const imgRatio = imgW / imgH;
    let dw = width, dh = height, dx = 0, dy = 0;
    if (imgRatio > canvasRatio) {
      dh = height;
      dw = imgRatio * dh;
      dx = (width - dw) / 2;
    } else {
      dw = width;
      dh = dw / imgRatio;
      dy = (height - dh) / 2;
    }
    ctx.drawImage(image, dx, dy, dw, dh);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  const panelH = Math.min(height * 0.33, 280);
  ctx.fillRect(0, height - panelH, width, panelH);

  ctx.fillStyle = '#ffffff';
  const padding = 48;
  ctx.font = 'bold 40px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto';
  ctx.textBaseline = 'top';
  ctx.fillText(slide.description ? 'Narration' : 'Slide', padding, height - panelH + padding - 8);

  ctx.font = '28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto';
  const textX = padding;
  const textY = height - panelH + padding + 32;
  const maxWidth = width - padding * 2;
  wrapText(ctx, slide.description || '', textX, textY, maxWidth, 36);
}

export async function exportLectureToWebM(draft: VideoDraft, opts?: { width?: number; height?: number; fps?: number; defaultSlideDurationMs?: number }): Promise<Blob> {
  const width = opts?.width ?? 1280;
  const height = opts?.height ?? 720;
  const fps = opts?.fps ?? 30;
  const defaultDur = opts?.defaultSlideDurationMs ?? 6000;

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

  for (const slide of draft.slides) {
    let image: HTMLImageElement | null = null;
    if (slide.imageUrl) {
      try { image = await loadImage(slide.imageUrl); } catch {}
    }

    drawSlide(ctx, slide, image, width, height);

    let durationMs = defaultDur;
    let ended = false;

    if (slide.audioUrl) {
      try {
        const audio = new Audio(slide.audioUrl);
        audio.crossOrigin = 'anonymous';
        const source = audioCtx.createMediaElementSource(audio);
        source.connect(dest);
        source.connect(audioCtx.destination);
        await audio.play();
        await new Promise<void>((resolve) => {
          audio.onended = () => { ended = true; resolve(); };
        });
        durationMs = Math.max(defaultDur, Math.floor(audio.duration * 1000));
      } catch {
        ended = true;
      }
    }

    const frames = Math.ceil((ended ? defaultDur : durationMs) / (1000 / fps));
    for (let i = 0; i < frames; i++) {
      await sleep(1000 / fps);
      // keep frame stream alive; redraw static frame
      drawSlide(ctx, slide, image, width, height);
    }
  }

  await sleep(250);
  recorder.stop();

  const blob: Blob = await new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  try { audioCtx.close(); } catch {}
  return blob;
}
