import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@xyflow/react/dist/style.css'
import './globals.css'
import '../src/App.css'

export const metadata: Metadata = {
  title: 'Procedural Texture Lab',
  description: 'Node-based procedural texture generation with React Flow and Vercel AI SDK.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
