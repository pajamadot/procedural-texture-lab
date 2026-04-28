import { fal } from '@fal-ai/client'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const MODEL = process.env.FAL_MODEL ?? 'fal-ai/flux/dev'

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

const makeFalInput = ({
  prompt,
  negativePrompt,
  guidanceScale,
  seed,
}: {
  prompt: string
  negativePrompt: string
  guidanceScale: number
  seed?: number
}) => ({
  prompt,
  negative_prompt: negativePrompt,
  image_size: 'square_hd',
  num_inference_steps: 28,
  guidance_scale: guidanceScale,
  seed,
  num_images: 1,
  enable_safety_checker: true,
})

const parsePromptBody = async (request: Request) => {
  const body = (await request.json()) as {
    prompt?: unknown
    negativePrompt?: unknown
    guidanceScale?: unknown
    seed?: unknown
  }
  let prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const negativePrompt = typeof body.negativePrompt === 'string' ? body.negativePrompt : ''
  const guidanceScale = normalizeNumber(body.guidanceScale, 3.5, 1, 20)
  const seed = body.seed === undefined || body.seed === null || body.seed === '' ? undefined : Math.floor(normalizeNumber(body.seed, 0, 0, 2147483647))

  if (!prompt) {
    prompt = 'abstract image'
  }

  return {
    prompt,
    negativePrompt,
    guidanceScale,
    seed,
  }
}

export async function POST(request: Request) {
  let parsed: Awaited<ReturnType<typeof parsePromptBody>>

  try {
    parsed = await parsePromptBody(request)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!process.env.FAL_KEY) {
    return NextResponse.json({ error: 'FAL_KEY is not configured' }, { status: 500 })
  }

  try {
    const queued = await fal.queue.submit(MODEL, {
      input: makeFalInput(parsed),
    })

    return NextResponse.json({
      source: 'fal',
      model: MODEL,
      requestId: queued.request_id,
      status: queued.status,
      texture: {
        label: 'Fal Texture',
        prompt: parsed.prompt,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fal image queue submission failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const requestId = searchParams.get('requestId')?.trim()
  const prompt = searchParams.get('prompt')?.trim() || 'abstract image'

  if (!requestId) {
    return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
  }

  if (!process.env.FAL_KEY) {
    return NextResponse.json({ error: 'FAL_KEY is not configured' }, { status: 500 })
  }

  try {
    const status = await fal.queue.status(MODEL, { requestId, logs: false })

    if (status.status !== 'COMPLETED') {
      return NextResponse.json({
        source: 'fal',
        model: MODEL,
        requestId,
        status: status.status,
        queuePosition: 'queue_position' in status ? status.queue_position : null,
        texture: {
          label: 'Fal Texture',
          prompt,
        },
      })
    }

    const result = await fal.queue.result(MODEL, { requestId })
    const imageUrl = getImageUrl(result.data)

    if (!imageUrl) {
      return NextResponse.json({ error: 'Fal did not return an image URL' }, { status: 502 })
    }

    return NextResponse.json({
      source: 'fal',
      model: MODEL,
      requestId,
      status: 'COMPLETED',
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
