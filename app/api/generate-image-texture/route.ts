import { fal } from '@fal-ai/client'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const MODEL = process.env.FAL_MODEL ?? 'fal-ai/f-lite/texture'

const normalizeNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue)) {
    return fallback
  }

  return Math.min(max, Math.max(min, numberValue))
}

const getImageUrl = (value: unknown) => {
  const data = value as {
    images?: Array<{ url?: string }>
    image?: { url?: string }
  }

  return data.images?.[0]?.url ?? data.image?.url ?? null
}

export async function POST(request: Request) {
  let prompt: string
  let negativePrompt: string
  let guidanceScale: number
  let seed: number | undefined

  try {
    const body = (await request.json()) as {
      prompt?: unknown
      negativePrompt?: unknown
      guidanceScale?: unknown
      seed?: unknown
    }
    prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    negativePrompt = typeof body.negativePrompt === 'string' ? body.negativePrompt : ''
    guidanceScale = normalizeNumber(body.guidanceScale, 3.5, 1, 20)
    seed = body.seed === undefined || body.seed === null || body.seed === '' ? undefined : Math.floor(normalizeNumber(body.seed, 0, 0, 2147483647))
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!prompt) {
    prompt = 'abstract image'
  }

  if (!process.env.FAL_KEY) {
    return NextResponse.json({ error: 'FAL_KEY is not configured' }, { status: 500 })
  }

  try {
    const result = await fal.subscribe(MODEL, {
      input: {
        prompt,
        negative_prompt: negativePrompt,
        image_size: 'square_hd',
        num_inference_steps: 28,
        guidance_scale: guidanceScale,
        seed,
        num_images: 1,
        enable_safety_checker: true,
      },
      logs: false,
    })
    const imageUrl = getImageUrl(result.data)

    if (!imageUrl) {
      return NextResponse.json({ error: 'Fal did not return an image URL' }, { status: 502 })
    }

    return NextResponse.json({
      source: 'fal',
      model: MODEL,
      requestId: result.requestId,
      texture: {
        label: 'Fal Texture',
        prompt,
        imageUrl,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fal image generation failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
