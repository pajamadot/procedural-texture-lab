export const TEXTURE_CONTRACT_VERSION = 'texture-code-v1'

export const FORBIDDEN_TEXTURE_TOKEN_PATTERN =
  /\b(window|document|globalThis|self|fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|eval|Function|constructor|import|require|process|Worker|postMessage)\b/

export const validateTextureCode = (code: string) => {
  const forbiddenToken = code.match(FORBIDDEN_TEXTURE_TOKEN_PATTERN)

  if (forbiddenToken) {
    return `Unsupported texture code token: ${forbiddenToken[1]}`
  }

  if (!/\breturn\b/.test(code)) {
    return 'Texture code must return a Color, number, or [r, g, b, a] array'
  }

  return null
}

export const TEXTURE_CODE_CONTRACT = `
Texture code ABI: texture-code-v1.
The code is a synchronous JavaScript function body, not a module.
Inputs injected into scope:
- uv: immutable Vec2 in normalized 0..1 coordinates.
- x, y, width, height: pixel coordinates and render size.
- time: numeric animation/sample time.
- params: numeric dictionary controlled by the node UI.
- input(index = 0, fallback = black, uv = current uv): samples connected upstream texture layers.
- inputs: array of upstream sampler functions.
- nodeId: current node id.
Vec2 API:
- uv.x, uv.y
- uv.add(v), uv.sub(v), uv.mul(v), uv.div(v)
- uv.fract(), uv.floor(), uv.abs(), uv.rotate(angle, origin = 0.5)
- uv.dot(v), uv.length(), uv.distance(v), uv.toArray()
Helpers:
- vec2(x, y), rgb(r,g,b), rgba(r,g,b,a), hsl(h,s,l,a)
- add(a,b), sub(a,b), mul(a,b), div(a,b) for number, Vec2, and Color/texture values
- mixColor(a,b,t), multiply(a,b,t), screen(a,b,t), overlay(a,b,t)
- clamp(v,min,max), saturate(v), fract(v), mix(a,b,t), step(edge,v), smoothstep(edge0,edge1,v)
- dot(a,b), length(v), distance(a,b), rotate(v,angle,origin)
- hash(x,y), noise(x,y), noise(vec2), fbm(x,y,octaves), fbm(vec2,octaves), ridged(...), voronoi(...)
Output:
- return Color from rgb/rgba/hsl/mixColor/etc, or a number grayscale, or [r,g,b,a].
Sandbox:
- no imports, DOM, network, storage, async, eval, Function, process, or globals.
`.trim()

export const TEXTURE_CODE_EXAMPLE = `const uvTiled = uv.mul(params.scale).fract();
const center = uvTiled.sub(0.5);
const dist = length(center);
const wave = 0.5 + 0.5 * sin(dist * params.frequency * PI * 2 - time * params.speed);
const ripple = smoothstep(0.0, 1.0, wave) * params.amplitude;
const upstream = input(0, black);
return add(mul(upstream, 0.35), rgb(ripple, ripple, ripple));`
