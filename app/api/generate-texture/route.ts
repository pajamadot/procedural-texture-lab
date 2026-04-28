import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { NextResponse } from 'next/server'
import {
  TEXTURE_CODE_CONTRACT,
  TEXTURE_CODE_EXAMPLE,
  TEXTURE_CONTRACT_VERSION,
  validateTextureCode,
} from '../../../src/textureContract'
import { createVibeTexture } from '../../../src/vibeGenerator'

export const runtime = 'nodejs'

type TexturePayload = {
  label: string
  prompt: string
  code: string
  params: Record<string, number>
}

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini'

const extractJson = (text: string) => {
  const trimmed = text.trim()

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const match = trimmed.match(/\{[\s\S]*\}/)
  return match?.[0] ?? trimmed
}

const normalizeTexture = (value: unknown, prompt: string): TexturePayload | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const source = value as Partial<TexturePayload>

  if (typeof source.code !== 'string') {
    return null
  }

  if (validateTextureCode(source.code)) {
    return null
  }

  const params: Record<string, number> = {}

  if (source.params && typeof source.params === 'object') {
    for (const [key, rawValue] of Object.entries(source.params)) {
      const numberValue = Number(rawValue)

      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) && Number.isFinite(numberValue)) {
        params[key] = numberValue
      }
    }
  }

  return {
    label: String(source.label || 'AI Texture').slice(0, 34),
    prompt: String(source.prompt || prompt).slice(0, 240),
    code: source.code.trim(),
    params,
  }
}

const localResponse = (prompt: string, status = 200) =>
  NextResponse.json(
    {
      source: 'local',
      texture: createVibeTexture(prompt),
    },
    { status },
  )

export async function POST(request: Request) {
  let prompt: string

  try {
    const body = (await request.json()) as { prompt?: unknown }
    prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  } catch {
    return localResponse('layered procedural material', 400)
  }

  if (!prompt) {
    prompt = 'layered procedural material'
  }

  if (!process.env.OPENAI_API_KEY) {
    return localResponse(prompt)
  }

  try {
    const result = await generateText({
      model: openai(MODEL),
      temperature: 0.7,
      system: [
        'You generate procedural texture node code for a browser texture graph.',
        `You must obey ${TEXTURE_CONTRACT_VERSION} exactly.`,
        'Return strict JSON only with keys: label, prompt, params, code.',
        'The code field must be only a JavaScript function body, not markdown and not a full function declaration.',
        TEXTURE_CODE_CONTRACT,
      ].join(' '),
      prompt: [
        `Texture vibe: ${prompt}`,
        'Make it tileable in UV space and editable through numeric params.',
        'Keep params to 2-5 numeric controls.',
        'Prefer the Vec2 ABI for coordinates: uv.mul(params.scale).fract(), uv.sub(0.5), length(v).',
        'For texture/color arithmetic, use add(a,b), sub(a,b), mul(a,b), div(a,b). Never use JS + - * / directly on Color or input() results.',
        'Example response shape:',
        JSON.stringify({
          label: 'AI Ripple',
          prompt: 'radial ripple',
          params: { scale: 8, frequency: 4, speed: 0.8, amplitude: 1 },
          code: TEXTURE_CODE_EXAMPLE,
        }),
      ].join('\n'),
    })

    const parsed = JSON.parse(extractJson(result.text)) as unknown
    const texture = normalizeTexture(parsed, prompt)

    if (!texture) {
      return localResponse(prompt)
    }

    return NextResponse.json({
      source: 'ai',
      texture,
    })
  } catch {
    return localResponse(prompt)
  }
}
