import { fal } from '@fal-ai/client'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const MODEL = process.env.FAL_MODEL ?? 'fal-ai/flux/dev'

const normalizePrompt = (prompt: string) =>
  [
    'Seamless tileable square material texture.',
    'No text, no logo, no border, no perspective, no object photo.',
    'Orthographic flat surface, evenly lit, usable as a repeating game or 3D material texture.',
    prompt,
  ].join(' ')

const getImageUrl = (value: unknown) => {
  const data = value as {
    images?: Array<{ url?: string }>
    image?: { url?: string }
  }

  return data.images?.[0]?.url ?? data.image?.url ?? null
}

export async function POST(request: Request) {
  let prompt: string

  try {
    const body = (await request.json()) as { prompt?: unknown }
    prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!prompt) {
    prompt = 'neutral seamless fabric texture'
  }

  if (!process.env.FAL_KEY) {
    return NextResponse.json({ error: 'FAL_KEY is not configured' }, { status: 500 })
  }

  try {
    const result = await fal.subscribe(MODEL, {
      input: {
        prompt: normalizePrompt(prompt),
        image_size: 'square_hd',
        num_images: 1,
        output_format: 'png',
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
