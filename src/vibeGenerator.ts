import type { TextureNodeData } from './types'

export type VibeTexture = Pick<TextureNodeData, 'label' | 'prompt' | 'code' | 'params'>

const fallbackPrompt = 'layered procedural material'

const hasAny = (text: string, words: string[]) => words.some((word) => text.includes(word))

export const createVibeTexture = (rawPrompt: string): VibeTexture => {
  const prompt = rawPrompt.trim() || fallbackPrompt
  const text = prompt.toLowerCase()

  if (hasAny(text, ['blend', 'mix', 'mask', 'layer', '叠加', '融合', '混合', '遮罩'])) {
    return {
      label: 'Vibe Blend',
      prompt,
      params: { amount: 0.72, scale: 6 },
      code: `const base = input(0, rgb(0.08, 0.09, 0.1));
const top = input(1, hsl(0.08, 0.72, 0.58, 1));
const mask = smoothstep(0.28, 0.82, fbm(uv.x * params.scale, uv.y * params.scale, 5));
const scratched = smoothstep(0.84, 0.97, noise(uv.x * 90, uv.y * 18));
return overlay(base, top, clamp(mask * params.amount + scratched * 0.18));`,
    }
  }

  if (hasAny(text, ['wood', 'timber', 'grain', '木', '木纹', '年轮'])) {
    return {
      label: 'Vibe Wood',
      prompt,
      params: { rings: 19, warp: 0.38, warmth: 0.66 },
      code: `const p = rotate({ x: uv.x * 1.25, y: uv.y * 2.2 }, 0.18);
const warp = fbm(p.x * 3.0, p.y * 5.0, 5) * params.warp;
const rings = fract((p.y + warp) * params.rings);
const grain = smoothstep(0.16, 0.84, rings) * 0.55 + fbm(uv.x * 28, uv.y * 7, 4) * 0.22;
const tone = mixColor(hsl(0.07, 0.72, 0.18), hsl(0.10, 0.88, 0.58), grain);
return mixColor(tone, hsl(0.05, 0.8, 0.36), params.warmth * 0.35);`,
    }
  }

  if (hasAny(text, ['marble', 'stone', 'vein', '大理石', '石', '纹理石'])) {
    return {
      label: 'Vibe Marble',
      prompt,
      params: { scale: 8.5, veins: 5.2, contrast: 0.74 },
      code: `const p = rotate({ x: uv.x * 1.45, y: uv.y * 1.05 }, -0.35);
const turbulence = fbm(p.x * 2.4, p.y * 2.4, 6) * params.veins;
const vein = sin((p.x + p.y * 0.65) * params.scale + turbulence);
const cut = smoothstep(0.18, 0.95, vein) * params.contrast;
const base = mixColor(rgb(0.09, 0.10, 0.12), rgb(0.72, 0.69, 0.62), fbm(p.x * 4.0, p.y * 4.0, 5));
return mixColor(base, rgb(0.98, 0.89, 0.72), cut);`,
    }
  }

  if (hasAny(text, ['water', 'wave', 'ocean', 'ripple', '水', '海', '波纹'])) {
    return {
      label: 'Vibe Water',
      prompt,
      params: { scale: 11, speed: 0.7, depth: 0.58 },
      code: `const rippleA = sin((uv.x + fbm(uv.x * 2.2, uv.y * 2.2, 4) * 0.08) * params.scale * PI + time * params.speed);
const rippleB = cos((uv.y * 1.4 + uv.x * 0.45) * params.scale * 1.6 + time * params.speed * 0.7);
const foam = smoothstep(0.72, 0.98, (rippleA + rippleB) * 0.35 + fbm(uv.x * 9, uv.y * 9, 5));
const water = hsl(0.53 + foam * 0.025, 0.72, 0.20 + params.depth * 0.28);
return mixColor(water, rgb(0.72, 0.94, 1.0), foam * 0.42);`,
    }
  }

  if (hasAny(text, ['metal', 'brushed', 'steel', 'aluminum', '金属', '拉丝', '钢'])) {
    return {
      label: 'Vibe Metal',
      prompt,
      params: { direction: 0.08, roughness: 0.42, brightness: 0.58 },
      code: `const p = rotate(uv, params.direction);
const brush = fbm(p.x * 160, p.y * 3.2, 4) * params.roughness;
const bands = sin(p.y * 72 + noise(p.x * 12, p.y * 4) * 4) * 0.035;
const scratches = smoothstep(0.88, 0.98, noise(p.x * 240, p.y * 18)) * 0.18;
const v = clamp(params.brightness + brush + bands + scratches);
return rgb(v * 0.78, v * 0.82, v * 0.88);`,
    }
  }

  if (hasAny(text, ['tile', 'checker', 'grid', 'ceramic', '砖', '瓷砖', '棋盘', '网格'])) {
    return {
      label: 'Vibe Tiles',
      prompt,
      params: { cols: 9, rows: 7, grout: 0.055 },
      code: `const gx = fract(uv.x * params.cols);
const gy = fract(uv.y * params.rows);
const mortar = step(gx, params.grout) + step(gy, params.grout) + step(1 - params.grout, gx) + step(1 - params.grout, gy);
const cell = (floor(uv.x * params.cols) + floor(uv.y * params.rows)) % 2;
const glaze = fbm(uv.x * 42, uv.y * 42, 3) * 0.12;
const tile = cell < 1 ? hsl(0.08, 0.42, 0.48 + glaze) : hsl(0.55, 0.28, 0.58 + glaze);
return mixColor(tile, rgb(0.06, 0.065, 0.07), saturate(mortar));`,
    }
  }

  if (hasAny(text, ['lava', 'fire', 'magma', '岩浆', '火', '熔岩'])) {
    return {
      label: 'Vibe Lava',
      prompt,
      params: { heat: 0.92, scale: 4.4, crack: 0.58 },
      code: `const flow = fbm(uv.x * params.scale + time * 0.05, uv.y * params.scale - time * 0.04, 6);
const crack = ridged(uv.x * 12 + flow * 2.2, uv.y * 12 - flow * 1.3, 5);
const glow = smoothstep(params.crack, 1.0, crack) * params.heat;
const ember = smoothstep(0.75, 0.98, noise(uv.x * 70, uv.y * 70)) * 0.35;
return mixColor(rgb(0.045, 0.018, 0.012), rgb(1.0, 0.43, 0.02), saturate(glow + ember));`,
    }
  }

  if (hasAny(text, ['moss', 'grass', 'organic', '苔藓', '草', '有机'])) {
    return {
      label: 'Vibe Moss',
      prompt,
      params: { scale: 8, damp: 0.62, specks: 0.9 },
      code: `const field = fbm(uv.x * params.scale, uv.y * params.scale, 6);
const fibers = ridged(uv.x * 22, uv.y * 14, 4) * 0.35;
const speckle = smoothstep(params.specks, 1.0, noise(uv.x * 95, uv.y * 95));
const green = mixColor(hsl(0.24, 0.52, 0.16), hsl(0.33, 0.58, 0.44), field + fibers);
return mixColor(green, hsl(0.18, 0.72, 0.62), speckle * params.damp);`,
    }
  }

  return {
    label: 'Vibe Field',
    prompt,
    params: { scale: 6.5, contrast: 0.64, hue: 0.58 },
    code: `const large = fbm(uv.x * params.scale, uv.y * params.scale, 6);
const small = ridged(uv.x * params.scale * 4.0, uv.y * params.scale * 4.0, 4);
const mask = smoothstep(0.22, 0.92, large * params.contrast + small * 0.32);
const low = hsl(params.hue, 0.55, 0.18);
const high = hsl(params.hue + 0.12, 0.74, 0.62);
return mixColor(low, high, mask);`,
  }
}

export const baseGraniteTexture: VibeTexture = {
  label: 'Granite Base',
  prompt: 'dark granite mineral base',
  params: { scale: 9, speckle: 0.78, tint: 0.58 },
  code: `const stone = fbm(uv.x * params.scale, uv.y * params.scale, 6);
const grit = smoothstep(params.speckle, 1.0, noise(uv.x * 80, uv.y * 80));
const base = mixColor(rgb(0.06, 0.065, 0.075), rgb(0.45, 0.46, 0.42), stone);
return mixColor(base, hsl(params.tint, 0.22, 0.72), grit * 0.38);`,
}

export const finalPolishTexture: VibeTexture = {
  label: 'Final Polish',
  prompt: 'polished output layer',
  params: { scale: 14, shine: 0.32, warmth: 0.16 },
  code: `const base = input(0, rgb(0.08, 0.09, 0.1));
const detail = ridged(uv.x * params.scale, uv.y * params.scale, 4);
const shine = smoothstep(0.64, 1.0, detail) * params.shine;
const warmed = overlay(base, hsl(0.09, 0.38, 0.55), params.warmth);
return screen(warmed, rgb(0.9, 0.86, 0.72), shine);`,
}
