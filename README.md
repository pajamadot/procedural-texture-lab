# Procedural Texture Lab

Next.js + React Flow procedural texture editor with code nodes and AI vibe generation.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## AI Generation

The UI calls `POST /api/generate-texture`. If `OPENAI_API_KEY` is configured, the route uses Vercel AI SDK and `@ai-sdk/openai` to generate editable texture node code. Without a key, it falls back to local prompt presets so the app still works offline.

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

## Node IO Contract: `texture-code-v1`

Code nodes run as a synchronous JavaScript function body, not a module. These values are injected into scope:

```js
uv, x, y, width, height, time, params, inputs, input
nodeId
```

`uv` is an immutable Vec2 API:

```js
uv.x
uv.y
uv.add(v)
uv.sub(v)
uv.mul(v)
uv.div(v)
uv.fract()
uv.floor()
uv.abs()
uv.rotate(angle, origin)
uv.dot(v)
uv.length()
uv.distance(v)
uv.toArray()
```

Helpers:

```js
vec2, rgb, rgba, hsl
add, sub, mul, div
mixColor, multiply, screen, overlay
clamp, saturate, fract, mix, step, smoothstep
dot, length, distance, rotate
hash, noise, fbm, ridged, voronoi
```

`add/sub/mul/div` are the strict texture math operators. They work on numbers, Vec2 values, and Color/texture samples from `input()`.

Return a `Color`, a grayscale number, or an `[r, g, b, a]` array:

```js
return rgba(r, g, b, a)
```

Connected upstream layers are sampled with:

```js
const base = input(0, rgb(0.05, 0.05, 0.06))
```

Example:

```js
const uvTiled = uv.mul(params.scale).fract()
const center = uvTiled.sub(0.5)
const dist = length(center)
const wave = 0.5 + 0.5 * sin(dist * params.frequency * PI * 2 - time * params.speed)
const ripple = smoothstep(0.0, 1.0, wave) * params.amplitude
const upstream = input(0, black)
return add(mul(upstream, 0.35), rgb(ripple, ripple, ripple))
```

## Deploy

This is a standard Next.js app and can be deployed to Vercel. Add `OPENAI_API_KEY` in Vercel Project Settings if you want live AI generation in production.
