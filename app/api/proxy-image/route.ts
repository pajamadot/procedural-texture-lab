import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const allowedHosts = ['fal.media', 'fal.ai']

const isAllowedHost = (host: string) =>
  allowedHosts.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`))

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawUrl = searchParams.get('url')

  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  }

  let url: URL

  try {
    url = new URL(rawUrl)
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  if (url.protocol !== 'https:' || !isAllowedHost(url.hostname)) {
    return NextResponse.json({ error: 'Image host is not allowed' }, { status: 400 })
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*',
    },
  })

  if (!response.ok || !response.body) {
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 })
  }

  const contentType = response.headers.get('content-type') ?? 'image/png'

  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'URL did not return an image' }, { status: 400 })
  }

  return new Response(response.body, {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': contentType,
    },
  })
}
