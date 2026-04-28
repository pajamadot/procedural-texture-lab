import type { Edge, Node } from '@xyflow/react'

export type TextureNodeKind = 'code' | 'operation' | 'compound'

export type TextureOperation =
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'
  | 'mix'
  | 'multiply'
  | 'screen'
  | 'overlay'

export type TextureNodeData = {
  kind: TextureNodeKind
  label: string
  prompt: string
  code: string
  params: Record<string, number>
  operation?: TextureOperation
  previewUrl?: string
}

export type TextureFlowNode = Node<TextureNodeData, 'textureCode' | 'operationNode' | 'compoundNode'>

export type TextureFlowEdge = Edge

export type Vec2 = {
  x: number
  y: number
  add: (value: Vec2Input) => Vec2
  sub: (value: Vec2Input) => Vec2
  mul: (value: Vec2Input) => Vec2
  div: (value: Vec2Input) => Vec2
  fract: () => Vec2
  floor: () => Vec2
  abs: () => Vec2
  rotate: (angle: number, origin?: Vec2Input) => Vec2
  dot: (value: Vec2Input) => number
  length: () => number
  distance: (value: Vec2Input) => number
  toArray: () => [number, number]
}

export type Vec2Input = number | { x: number; y: number } | [number, number]

export type Color = {
  r: number
  g: number
  b: number
  a: number
}

export type RenderResult = {
  imageData: ImageData
  error: string | null
}
