import type {
  Color,
  RenderResult,
  TextureFlowEdge,
  TextureFlowNode,
  Vec2,
  Vec2Input,
} from './types'
import { validateTextureCode } from './textureContract'

type UserTextureContext = {
  uv: Vec2
  x: number
  y: number
  width: number
  height: number
  time: number
  params: Record<string, number>
  inputs: Array<(uv?: Vec2Input) => Color>
  input: (index?: number, fallback?: Color | number | number[], sampleUv?: Vec2Input) => Color
  nodeId: string
}

type UserTextureFunction = (
  ctx: UserTextureContext,
  helpers: TextureHelpers,
) => unknown

type TextureHelpers = typeof helpers

const black: Color = { r: 0, g: 0, b: 0, a: 1 }
const white: Color = { r: 1, g: 1, b: 1, a: 1 }

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0))

const saturate = (value: number) => clamp(value)
const fract = (value: number) => value - Math.floor(value)
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const step = (edge: number, value: number) => (value < edge ? 0 : 1)
const isVec2Like = (value: unknown): value is Vec2Input =>
  typeof value === 'number' ||
  Array.isArray(value) ||
  (Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as { x?: unknown }).x === 'number' &&
    typeof (value as { y?: unknown }).y === 'number')

const vec2 = (x: number | Vec2Input = 0, y?: number): Vec2 => {
  const source = toVec2Input(x, y)
  const vx = source.x
  const vy = source.y

  return {
    x: vx,
    y: vy,
    add: (value) => {
      const v = toVec2Input(value)
      return vec2(vx + v.x, vy + v.y)
    },
    sub: (value) => {
      const v = toVec2Input(value)
      return vec2(vx - v.x, vy - v.y)
    },
    mul: (value) => {
      const v = toVec2Input(value)
      return vec2(vx * v.x, vy * v.y)
    },
    div: (value) => {
      const v = toVec2Input(value)
      return vec2(vx / (v.x || 1), vy / (v.y || 1))
    },
    fract: () => vec2(fract(vx), fract(vy)),
    floor: () => vec2(Math.floor(vx), Math.floor(vy)),
    abs: () => vec2(Math.abs(vx), Math.abs(vy)),
    rotate: (angle, origin = 0.5) => rotate(vec2(vx, vy), angle, origin),
    dot: (value) => dot(vec2(vx, vy), toVec2(value)),
    length: () => length(vec2(vx, vy)),
    distance: (value) => distance(vec2(vx, vy), toVec2(value)),
    toArray: () => [vx, vy],
  }
}

const toVec2Input = (value: number | Vec2Input = 0, y?: number): { x: number; y: number } => {
  if (typeof value === 'number') {
    return {
      x: Number.isFinite(value) ? value : 0,
      y: Number.isFinite(y ?? value) ? (y ?? value) : 0,
    }
  }

  if (Array.isArray(value)) {
    return {
      x: Number.isFinite(value[0]) ? value[0] : 0,
      y: Number.isFinite(value[1]) ? value[1] : 0,
    }
  }

  return {
    x: Number.isFinite(value.x) ? value.x : 0,
    y: Number.isFinite(value.y) ? value.y : 0,
  }
}

const toVec2 = (value: Vec2Input): Vec2 => vec2(value)

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = saturate((value - edge0) / (edge1 - edge0 || 1))
  return t * t * (3 - 2 * t)
}

const dot = (a: Vec2Input, b: Vec2Input) => {
  const va = toVec2Input(a)
  const vb = toVec2Input(b)
  return va.x * vb.x + va.y * vb.y
}
const length = (value: Vec2Input) => {
  const v = toVec2Input(value)
  return Math.hypot(v.x, v.y)
}
const length2 = length
const distance = (a: Vec2Input, b: Vec2Input) => {
  const va = toVec2Input(a)
  const vb = toVec2Input(b)
  return Math.hypot(va.x - vb.x, va.y - vb.y)
}

const rotate = (uv: Vec2Input, angle: number, origin: Vec2Input = 0.5) => {
  const p = toVec2Input(uv)
  const o = toVec2Input(origin)
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const x = p.x - o.x
  const y = p.y - o.y

  return vec2(x * c - y * s + o.x, x * s + y * c + o.y)
}

const hash = (x: number, y = 0) =>
  fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123)

const getNoiseCoordinates = (x: number | Vec2Input, yOrOctaves = 0, fallbackOctaves = 5) => {
  if (isVec2Like(x) && typeof x !== 'number') {
    const v = toVec2Input(x)
    return { x: v.x, y: v.y, octaves: yOrOctaves || fallbackOctaves }
  }

  return { x: Number(x), y: yOrOctaves, octaves: fallbackOctaves }
}

const noise = (x: number | Vec2Input, y = 0) => {
  const coords = getNoiseCoordinates(x, y)
  x = coords.x
  y = coords.y
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = fract(x)
  const fy = fract(y)
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)

  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)

  return mix(mix(a, b, ux), mix(c, d, ux), uy)
}

const fbm = (x: number | Vec2Input, yOrOctaves = 0, octaves = 5) => {
  const coords = getNoiseCoordinates(x, yOrOctaves, octaves)
  const xValue = coords.x
  const yValue = coords.y
  const octaveCount = coords.octaves
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  let normalizer = 0

  for (let i = 0; i < octaveCount; i += 1) {
    value += amplitude * noise(xValue * frequency, yValue * frequency)
    normalizer += amplitude
    frequency *= 2.03
    amplitude *= 0.5
  }

  return value / normalizer
}

const ridged = (x: number | Vec2Input, yOrOctaves = 0, octaves = 5) => {
  const coords = getNoiseCoordinates(x, yOrOctaves, octaves)
  const xValue = coords.x
  const yValue = coords.y
  const octaveCount = coords.octaves
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  let normalizer = 0

  for (let i = 0; i < octaveCount; i += 1) {
    value += amplitude * (1 - Math.abs(noise(xValue * frequency, yValue * frequency) * 2 - 1))
    normalizer += amplitude
    frequency *= 2.1
    amplitude *= 0.5
  }

  return saturate(value / normalizer)
}

const voronoi = (x: number | Vec2Input, y = 0) => {
  const coords = getNoiseCoordinates(x, y)
  x = coords.x
  y = coords.y
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let closest = 8

  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const cellX = ix + ox
      const cellY = iy + oy
      const point = {
        x: cellX + hash(cellX, cellY),
        y: cellY + hash(cellX + 7.13, cellY + 19.91),
      }
      closest = Math.min(closest, Math.hypot(point.x - x, point.y - y))
    }
  }

  return saturate(closest)
}

const rgba = (r: number, g: number, b: number, a = 1): Color => ({
  r: saturate(r),
  g: saturate(g),
  b: saturate(b),
  a: saturate(a),
})

const rgb = (r: number, g: number, b: number): Color => rgba(r, g, b, 1)

const isColorLike = (value: unknown) =>
  (Array.isArray(value) && value.length >= 3) ||
  (Boolean(value) &&
    typeof value === 'object' &&
    ('r' in (value as Record<string, unknown>) ||
      'g' in (value as Record<string, unknown>) ||
      'b' in (value as Record<string, unknown>)))

const hsl = (h: number, s: number, l: number, a = 1): Color => {
  const hue = fract(h)
  const sat = saturate(s)
  const light = saturate(l)
  const chroma = (1 - Math.abs(2 * light - 1)) * sat
  const segment = hue * 6
  const x = chroma * (1 - Math.abs((segment % 2) - 1))
  const match = light - chroma / 2
  let r = 0
  let g = 0
  let b = 0

  if (segment < 1) {
    r = chroma
    g = x
  } else if (segment < 2) {
    r = x
    g = chroma
  } else if (segment < 3) {
    g = chroma
    b = x
  } else if (segment < 4) {
    g = x
    b = chroma
  } else if (segment < 5) {
    r = x
    b = chroma
  } else {
    r = chroma
    b = x
  }

  return rgba(r + match, g + match, b + match, a)
}

const mixColor = (a: Color | number | number[], b: Color | number | number[], t: number) => {
  const ca = toColor(a)
  const cb = toColor(b)
  const amount = saturate(t)

  return rgba(
    mix(ca.r, cb.r, amount),
    mix(ca.g, cb.g, amount),
    mix(ca.b, cb.b, amount),
    mix(ca.a, cb.a, amount),
  )
}

const operate = (a: unknown, b: unknown, operation: (left: number, right: number) => number) => {
  if (isColorLike(a) || isColorLike(b)) {
    const ca = toColor(a)
    const cb = toColor(b)

    return rgba(
      operation(ca.r, cb.r),
      operation(ca.g, cb.g),
      operation(ca.b, cb.b),
      operation(ca.a, cb.a),
    )
  }

  if (isVec2Like(a) || isVec2Like(b)) {
    const va = toVec2Input(isVec2Like(a) ? a : Number(a) || 0)
    const vb = toVec2Input(isVec2Like(b) ? b : Number(b) || 0)

    return vec2(operation(va.x, vb.x), operation(va.y, vb.y))
  }

  return operation(Number(a) || 0, Number(b) || 0)
}

const add = (a: unknown, b: unknown) => operate(a, b, (left, right) => left + right)
const sub = (a: unknown, b: unknown) => operate(a, b, (left, right) => left - right)
const mul = (a: unknown, b: unknown) => operate(a, b, (left, right) => left * right)
const div = (a: unknown, b: unknown) => operate(a, b, (left, right) => left / (right || 1))

const multiply = (a: Color | number | number[], b: Color | number | number[], amount = 1) => {
  const ca = toColor(a)
  const cb = toColor(b)
  return mixColor(ca, rgba(ca.r * cb.r, ca.g * cb.g, ca.b * cb.b, ca.a), amount)
}

const screen = (a: Color | number | number[], b: Color | number | number[], amount = 1) => {
  const ca = toColor(a)
  const cb = toColor(b)
  return mixColor(
    ca,
    rgba(1 - (1 - ca.r) * (1 - cb.r), 1 - (1 - ca.g) * (1 - cb.g), 1 - (1 - ca.b) * (1 - cb.b), ca.a),
    amount,
  )
}

const overlay = (a: Color | number | number[], b: Color | number | number[], amount = 1) => {
  const ca = toColor(a)
  const cb = toColor(b)
  const channel = (base: number, top: number) =>
    base < 0.5 ? 2 * base * top : 1 - 2 * (1 - base) * (1 - top)

  return mixColor(ca, rgba(channel(ca.r, cb.r), channel(ca.g, cb.g), channel(ca.b, cb.b), ca.a), amount)
}

const toColor = (value: unknown, fallback: Color = black): Color => {
  if (typeof value === 'number') {
    const normalized = saturate(value)
    return rgba(normalized, normalized, normalized, 1)
  }

  if (Array.isArray(value)) {
    return rgba(
      Number(value[0] ?? fallback.r),
      Number(value[1] ?? fallback.g),
      Number(value[2] ?? fallback.b),
      Number(value[3] ?? fallback.a),
    )
  }

  if (value && typeof value === 'object') {
    const source = value as Partial<Color>
    return rgba(
      Number(source.r ?? fallback.r),
      Number(source.g ?? fallback.g),
      Number(source.b ?? fallback.b),
      Number(source.a ?? fallback.a),
    )
  }

  return fallback
}

const helpers = {
  black,
  white,
  vec2,
  clamp,
  saturate,
  fract,
  mix,
  step,
  smoothstep,
  dot,
  length,
  length2,
  distance,
  rotate,
  hash,
  noise,
  fbm,
  ridged,
  voronoi,
  rgba,
  rgb,
  hsl,
  add,
  sub,
  mul,
  div,
  mixColor,
  multiply,
  screen,
  overlay,
}

const compileTextureFunction = (code: string): UserTextureFunction => {
  const validationError = validateTextureCode(code)

  if (validationError) {
    throw new Error(validationError)
  }

  const wrappedCode = `
"use strict";
const { uv, x, y, width, height, time, params, inputs, input, nodeId } = ctx;
const { black, white, vec2, clamp, saturate, fract, mix, step, smoothstep, dot, length, length2, distance, rotate, hash, noise, fbm, ridged, voronoi, rgba, rgb, hsl, add, sub, mul, div, mixColor, multiply, screen, overlay } = helpers;
const { PI, abs, acos, asin, atan, atan2, ceil, cos, exp, floor, log, max, min, pow, round, sin, sqrt, tan } = Math;
${code}
`

  return new Function('ctx', 'helpers', wrappedCode) as UserTextureFunction
}

const makeErrorImage = (width: number, height: number, message: string): RenderResult => {
  const imageData = new ImageData(width, height)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const stripe = (Math.floor(x / 8) + Math.floor(y / 8)) % 2
      imageData.data[index] = stripe ? 222 : 38
      imageData.data[index + 1] = stripe ? 52 : 12
      imageData.data[index + 2] = stripe ? 88 : 24
      imageData.data[index + 3] = 255
    }
  }

  return { imageData, error: message }
}

export const renderTextureGraph = ({
  nodes,
  edges,
  targetNodeId,
  width,
  height,
  time = 0,
}: {
  nodes: TextureFlowNode[]
  edges: TextureFlowEdge[]
  targetNodeId: string
  width: number
  height: number
  time?: number
}): RenderResult => {
  const imageData = new ImageData(width, height)
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const incoming = new Map<string, TextureFlowEdge[]>()
  const compiled = new Map<string, UserTextureFunction>()

  for (const edge of edges) {
    if (!edge.target || !edge.source) {
      continue
    }

    const current = incoming.get(edge.target) ?? []
    current.push(edge)
    incoming.set(edge.target, current)
  }

  const sampleNode = (nodeId: string, uv: Vec2, stack: Set<string>): Color => {
    const node = nodeMap.get(nodeId)

    if (!node) {
      return black
    }

    if (stack.has(nodeId)) {
      throw new Error(`Cycle detected at ${node.data.label}`)
    }

    stack.add(nodeId)

    try {
      const sourceEdges = [...(incoming.get(nodeId) ?? [])].sort((a, b) =>
        `${a.targetHandle ?? ''}${a.id}`.localeCompare(`${b.targetHandle ?? ''}${b.id}`),
      )
      const inputSamplers = sourceEdges.map((edge) => (sampleUv: Vec2Input = uv) =>
        sampleNode(edge.source, toVec2(sampleUv), stack),
      )

      if (node.data.kind === 'compound') {
        return inputSamplers[0]?.(uv) ?? black
      }

      let userFunction = compiled.get(nodeId)

      if (!userFunction) {
        userFunction = compileTextureFunction(node.data.code)
        compiled.set(nodeId, userFunction)
      }

      const ctx: UserTextureContext = {
        uv,
        x: uv.x * width,
        y: uv.y * height,
        width,
        height,
        time,
        params: node.data.params,
        inputs: inputSamplers,
        input: (index = 0, fallback = black, sampleUv = uv) =>
          inputSamplers[index]?.(toVec2(sampleUv)) ?? toColor(fallback, black),
        nodeId,
      }

      return toColor(userFunction(ctx, helpers), black)
    } finally {
      stack.delete(nodeId)
    }
  }

  try {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const uv = vec2(width <= 1 ? 0 : x / (width - 1), height <= 1 ? 0 : y / (height - 1))
        const color = sampleNode(targetNodeId, uv, new Set())
        const index = (y * width + x) * 4

        imageData.data[index] = Math.round(saturate(color.r) * 255)
        imageData.data[index + 1] = Math.round(saturate(color.g) * 255)
        imageData.data[index + 2] = Math.round(saturate(color.b) * 255)
        imageData.data[index + 3] = Math.round(saturate(color.a) * 255)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Texture render failed'
    return makeErrorImage(width, height, message)
  }

  return { imageData, error: null }
}
