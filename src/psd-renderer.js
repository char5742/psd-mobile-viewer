/**
 * PSD renderer — composites visible layers onto an OffscreenCanvas / Canvas
 * using @webtoon/psd parsed layer data.
 */

/** Map from PSD blend mode keys to CSS/Canvas globalCompositeOperation */
const BLEND_MAP = {
  norm: 'source-over',
  diss: 'source-over', // dissolve → fallback
  dark: 'darken',
  mul:  'multiply',
  idiv: 'color-burn',
  lddg: 'color-burn',
  colb: 'color-burn',
  lite: 'lighten',
  scrn: 'screen',
  div:  'color-dodge',
  over: 'overlay',
  sLit: 'soft-light',
  hLit: 'hard-light',
  vLit: 'hard-light',
  lLit: 'hard-light',
  pLit: 'hard-light',
  diff: 'difference',
  smud: 'exclusion',
  fsub: 'exclusion',
  fadd: 'screen',
  hue:  'hue',
  sat:  'saturation',
  colr: 'color',
  lum:  'luminosity',
};

/** Derive a stable string key for a layer, matching layer-panel.js */
function _layerId(layer) {
  return `${layer.name}__${layer.type}__${layer.left ?? 0}__${layer.top ?? 0}`;
}

/**
 * Composite all visible layers and return an ImageData.
 *
 * @param {import('@webtoon/psd').default} psd
 * @param {Map<string, { visible: boolean, opacity: number }>} layerState
 * @param {number} psdWidth
 * @param {number} psdHeight
 * @returns {Promise<ImageData>}
 */
export async function compositeToImageData(psd, layerState, psdWidth, psdHeight) {
  const canvas = new OffscreenCanvas(psdWidth, psdHeight);
  const ctx = canvas.getContext('2d');

  // Walk through layers bottom-to-top (reversed)
  const layers = [...psd.children].reverse();
  await _drawLayers(ctx, layers, layerState, psdWidth, psdHeight);

  return ctx.getImageData(0, 0, psdWidth, psdHeight);
}

async function _drawLayers(ctx, layers, layerState, psdWidth, psdHeight) {
  for (const layer of layers) {
    const id = _layerId(layer);
    const state = layerState.get(id) ?? {
      visible: !(layer.isHidden ?? false),
      opacity: layer.opacity ?? 255,
    };

    if (!state.visible) continue;

    const blendMode = layer.layerFrame?.layerProperties?.blendMode;

    if (layer.children && layer.children.length > 0) {
      // Group — composite children into a temporary canvas then draw
      const groupCanvas = new OffscreenCanvas(psdWidth, psdHeight);
      const groupCtx = groupCanvas.getContext('2d');
      const childLayers = [...layer.children].reverse();
      await _drawLayers(groupCtx, childLayers, layerState, psdWidth, psdHeight);
      ctx.save();
      ctx.globalAlpha = state.opacity / 255;
      ctx.globalCompositeOperation = BLEND_MAP[blendMode] ?? 'source-over';
      ctx.drawImage(groupCanvas, 0, 0);
      ctx.restore();
      continue;
    }

    // Leaf layer — use the library's async composite() to decode pixel data
    try {
      if (layer.width === 0 || layer.height === 0) continue;

      const pixelData = await layer.composite(false, false); // applyEffects=false, useComposedOpacity=false — raw RGBA; opacity applied via ctx.globalAlpha
      if (!pixelData || pixelData.length === 0) continue;

      const imgData = new ImageData(
        new Uint8ClampedArray(pixelData),
        layer.width,
        layer.height,
      );
      const tmp = new OffscreenCanvas(layer.width, layer.height);
      tmp.getContext('2d').putImageData(imgData, 0, 0);

      ctx.save();
      ctx.globalAlpha = state.opacity / 255;
      ctx.globalCompositeOperation = BLEND_MAP[blendMode] ?? 'source-over';
      ctx.drawImage(tmp, layer.left, layer.top);
      ctx.restore();
    } catch (err) {
      // Skip layers that fail to render (e.g. unsupported encoding), but log for debugging
      console.warn('Failed to composite layer:', layer.name, err);
    }
  }
}

/**
 * Render composited ImageData onto the visible canvas with viewport transform.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {ImageData}         imageData
 * @param {{ x: number, y: number, scale: number }} viewport
 */
export function renderToCanvas(canvas, imageData, viewport) {
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;

  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Source bitmap
  const src = new OffscreenCanvas(imageData.width, imageData.height);
  src.getContext('2d').putImageData(imageData, 0, 0);

  const dw = imageData.width * viewport.scale;
  const dh = imageData.height * viewport.scale;
  const dx = (W - dw) / 2 + viewport.x;
  const dy = (H - dh) / 2 + viewport.y;

  ctx.drawImage(src, dx, dy, dw, dh);
}

/**
 * Calculate fit-to-screen viewport values.
 * @param {number} psdW
 * @param {number} psdH
 * @param {number} viewW
 * @param {number} viewH
 * @returns {{ x: number, y: number, scale: number }}
 */
export function fitViewport(psdW, psdH, viewW, viewH) {
  const scale = Math.min(viewW / psdW, viewH / psdH, 1) * 0.92;
  return { x: 0, y: 0, scale };
}
