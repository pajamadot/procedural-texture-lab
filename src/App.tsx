'use client'

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type NodeProps,
} from '@xyflow/react'
import {
  Blend,
  Boxes,
  Code2,
  Download,
  Image as ImageIcon,
  Layers3,
  Play,
  Plus,
  RefreshCcw,
  SlidersHorizontal,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderTextureGraph } from './textureEngine'
import type {
  BitmapTexture,
  TextureFlowEdge,
  TextureFlowNode,
  TextureNodeData,
  TextureOperation,
} from './types'
import {
  baseGraniteTexture,
  createVibeTexture,
  finalPolishTexture,
  type VibeTexture,
} from './vibeGenerator'

const STORAGE_KEY = 'procedural-texture-workbench:v1'
const PREVIEW_SIZE = 256
const THUMB_SIZE = 72
const NODE_PREVIEW_SIZE = 128

const operationOptions: Array<{ value: TextureOperation; label: string }> = [
  { value: 'add', label: 'Add' },
  { value: 'sub', label: 'Subtract' },
  { value: 'mul', label: 'Multiply' },
  { value: 'div', label: 'Divide' },
  { value: 'mix', label: 'Mix' },
  { value: 'multiply', label: 'Blend Multiply' },
  { value: 'screen', label: 'Blend Screen' },
  { value: 'overlay', label: 'Blend Overlay' },
]

const getOperationLabel = (operation: TextureOperation) =>
  operationOptions.find((option) => option.value === operation)?.label ?? 'Operation'

type StoredFlow = {
  nodes: TextureFlowNode[]
  edges: TextureFlowEdge[]
  selectedNodeId: string
}

const toNodeData = (texture: VibeTexture): TextureNodeData => ({
  kind: 'code',
  label: texture.label,
  prompt: texture.prompt,
  code: texture.code,
  params: texture.params,
})

const stripPreviewData = (data: TextureNodeData): TextureNodeData => {
  return {
    kind: data.kind,
    label: data.label,
    prompt: data.prompt,
    code: data.code,
    params: data.params,
    operation: data.operation,
    imageUrl: data.imageUrl,
  }
}

const defaultFlow = (): StoredFlow => ({
  selectedNodeId: 'final-polish',
  nodes: [
    {
      id: 'granite-base',
      type: 'textureCode',
      position: { x: 40, y: 140 },
      data: toNodeData(baseGraniteTexture),
    },
    {
      id: 'final-polish',
      type: 'textureCode',
      position: { x: 380, y: 140 },
      data: toNodeData(finalPolishTexture),
    },
  ],
  edges: [
    {
      id: 'granite-base-final-polish',
      source: 'granite-base',
      target: 'final-polish',
      type: 'smoothstep',
    },
  ],
})

const loadInitialFlow = (): StoredFlow => {
  const fallback = defaultFlow()

  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)

    if (!saved) {
      return fallback
    }

    const parsed = JSON.parse(saved) as Partial<StoredFlow>

    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return fallback
    }

    return {
      nodes: parsed.nodes,
      edges: parsed.edges,
      selectedNodeId: parsed.selectedNodeId ?? parsed.nodes[0]?.id ?? fallback.selectedNodeId,
    }
  } catch {
    return fallback
  }
}

const makeId = (prefix: string) => {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`
  }

  return `${prefix}-${Date.now()}`
}

const requestVibeTexture = async (prompt: string): Promise<VibeTexture & { source: 'ai' | 'local' }> => {
  try {
    const response = await fetch('/api/generate-texture', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    })

    if (!response.ok) {
      throw new Error('AI texture generation failed')
    }

    const payload = (await response.json()) as {
      source?: 'ai' | 'local'
      texture?: VibeTexture
    }

    if (!payload.texture?.code) {
      throw new Error('AI response did not include texture code')
    }

    return {
      ...payload.texture,
      source: payload.source ?? 'ai',
    }
  } catch {
    return {
      ...createVibeTexture(prompt),
      source: 'local',
    }
  }
}

const requestFalTexture = async (prompt: string) => {
  const response = await fetch('/api/generate-image-texture', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  })

  if (!response.ok) {
    throw new Error('Fal image texture generation failed')
  }

  return (await response.json()) as {
    source: 'fal'
    texture: {
      label: string
      prompt: string
      imageUrl: string
    }
  }
}

const getProxiedImageUrl = (imageUrl: string) => `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`

const loadBitmapTexture = async (imageUrl: string): Promise<BitmapTexture> => {
  const response = await fetch(getProxiedImageUrl(imageUrl))

  if (!response.ok) {
    throw new Error('Failed to load texture image')
  }

  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    bitmap.close()
    throw new Error('Canvas 2D context is unavailable')
  }

  canvas.width = bitmap.width
  canvas.height = bitmap.height
  context.drawImage(bitmap, 0, 0)
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()

  return {
    width: imageData.width,
    height: imageData.height,
    data: imageData.data,
  }
}

const getRenderSignature = (nodes: TextureFlowNode[], edges: TextureFlowEdge[], time: number) =>
  JSON.stringify({
    time,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      data: stripPreviewData(node.data),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    })),
  })

const TextureCodeNode = memo(({ data, selected }: NodeProps<TextureFlowNode>) => (
  <div className={`texture-node ${selected ? 'is-selected' : ''}`}>
    <Handle className="flow-handle" type="target" position={Position.Left} />
    <div className="node-preview">
      {data.previewUrl ? <img src={data.previewUrl} alt="" draggable={false} /> : null}
    </div>
    <div className="node-caption">
      <Code2 size={13} aria-hidden="true" />
      <span>{data.label}</span>
    </div>
    <Handle className="flow-handle" type="source" position={Position.Right} />
  </div>
))

TextureCodeNode.displayName = 'TextureCodeNode'

const ImageTextureNode = memo(({ data, selected }: NodeProps<TextureFlowNode>) => (
  <div className={`texture-node image-node ${selected ? 'is-selected' : ''}`}>
    <div className="node-preview">
      {data.previewUrl ? <img src={data.previewUrl} alt="" draggable={false} /> : null}
      <div className="operation-badge">image</div>
    </div>
    <div className="node-caption">
      <ImageIcon size={13} aria-hidden="true" />
      <span>{data.label}</span>
    </div>
    <Handle className="flow-handle" type="source" position={Position.Right} />
  </div>
))

ImageTextureNode.displayName = 'ImageTextureNode'

const OperationNode = memo(({ data, selected }: NodeProps<TextureFlowNode>) => (
  <div className={`texture-node operation-node ${selected ? 'is-selected' : ''}`}>
    <Handle className="flow-handle op-handle op-handle-a" id="a" type="target" position={Position.Left} />
    <Handle className="flow-handle op-handle op-handle-b" id="b" type="target" position={Position.Left} />
    <div className="node-preview">
      {data.previewUrl ? <img src={data.previewUrl} alt="" draggable={false} /> : null}
      <div className="operation-badge">{data.operation ?? 'mix'}</div>
    </div>
    <div className="node-caption">
      <Blend size={13} aria-hidden="true" />
      <span>{data.label}</span>
    </div>
    <Handle className="flow-handle" type="source" position={Position.Right} />
  </div>
))

OperationNode.displayName = 'OperationNode'

const CompoundNode = memo(({ data, selected }: NodeProps<TextureFlowNode>) => (
  <div className={`texture-node compound-node ${selected ? 'is-selected' : ''}`}>
    <Handle className="flow-handle" type="target" position={Position.Left} />
    <div className="node-preview node-preview-empty">
      {data.previewUrl ? <img src={data.previewUrl} alt="" draggable={false} /> : <Boxes size={26} aria-hidden="true" />}
    </div>
    <div className="node-caption">
      <Boxes size={13} aria-hidden="true" />
      <span>{data.label}</span>
    </div>
    <Handle className="flow-handle" type="source" position={Position.Right} />
  </div>
))

CompoundNode.displayName = 'CompoundNode'

const nodeTypes = {
  textureCode: TextureCodeNode,
  imageNode: ImageTextureNode,
  operationNode: OperationNode,
  compoundNode: CompoundNode,
}

function TextureCanvas({
  nodes,
  edges,
  targetNodeId,
  size,
  time,
  imageAssets,
  showError = false,
}: {
  nodes: TextureFlowNode[]
  edges: TextureFlowEdge[]
  targetNodeId: string
  size: number
  time: number
  imageAssets?: Record<string, BitmapTexture>
  showError?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas || !targetNodeId) {
      return
    }

    const result = renderTextureGraph({
      nodes,
      edges,
      targetNodeId,
      width: size,
      height: size,
      time,
      imageAssets,
    })
    const context = canvas.getContext('2d')

    canvas.width = size
    canvas.height = size
    context?.putImageData(result.imageData, 0, 0)
    setError(result.error)
  }, [edges, imageAssets, nodes, size, targetNodeId, time])

  return (
    <div className="texture-canvas-wrap">
      <canvas ref={canvasRef} className="texture-canvas" width={size} height={size} />
      {showError && error ? <div className="render-error">{error}</div> : null}
    </div>
  )
}

function AppWorkbench() {
  const initialFlow = useMemo(() => defaultFlow(), [])
  const [nodes, setNodes, onNodesChange] = useNodesState<TextureFlowNode>(initialFlow.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<TextureFlowEdge>(initialFlow.edges)
  const [selectedNodeId, setSelectedNodeId] = useState(initialFlow.selectedNodeId)
  const [vibePrompt, setVibePrompt] = useState('polished black marble with warm veins')
  const [newParamName, setNewParamName] = useState('')
  const [renderTick, setRenderTick] = useState(1)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationSource, setGenerationSource] = useState<'idle' | 'ai' | 'fal' | 'local'>('idle')
  const [nodePreviewUrls, setNodePreviewUrls] = useState<Record<string, string>>({})
  const [imageAssets, setImageAssets] = useState<Record<string, BitmapTexture>>({})
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0]
  const previewNodeId = selectedNode?.id ?? nodes[0]?.id ?? ''
  const currentTime = renderTick * 0.23
  const previewSignature = useMemo(() => getRenderSignature(nodes, edges, currentTime), [currentTime, edges, nodes])
  const imageNodeSources = useMemo(
    () =>
      JSON.stringify(
        nodes
          .filter((node) => node.data.kind === 'image' && node.data.imageUrl)
          .map((node) => ({ id: node.id, imageUrl: node.data.imageUrl })),
      ),
    [nodes],
  )
  const flowNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          previewUrl:
            nodePreviewUrls[node.id] ??
            (node.data.kind === 'image' && node.data.imageUrl ? getProxiedImageUrl(node.data.imageUrl) : undefined),
        },
      })),
    [nodePreviewUrls, nodes],
  )

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const savedFlow = loadInitialFlow()
      setNodes(savedFlow.nodes)
      setEdges(savedFlow.edges)
      setSelectedNodeId(savedFlow.selectedNodeId)
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [setEdges, setNodes])

  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
  }, [edges, nodes])

  useEffect(() => {
    const imageNodes = JSON.parse(imageNodeSources) as Array<{ id: string; imageUrl: string }>
    let cancelled = false

    void Promise.all(
      imageNodes.map(async (node) => {
        try {
          return [node.id, await loadBitmapTexture(node.imageUrl)] as const
        } catch {
          return null
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        return
      }

      setImageAssets(
        Object.fromEntries(entries.filter((entry): entry is readonly [string, BitmapTexture] => Boolean(entry))),
      )
    })

    return () => {
      cancelled = true
    }
  }, [imageNodeSources])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const stored: StoredFlow = {
        selectedNodeId,
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.type,
          position: node.position,
          data: stripPreviewData(node.data),
        })) as TextureFlowNode[],
        edges: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          type: edge.type,
        })),
      }

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [edges, nodes, selectedNodeId])

  useEffect(() => {
    let cancelled = false
    let frameId = 0
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    canvas.width = NODE_PREVIEW_SIZE
    canvas.height = NODE_PREVIEW_SIZE

    const nextPreviews: Record<string, string> = {}

    const renderNodes = nodesRef.current.map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: 0, y: 0 },
      data: stripPreviewData(node.data),
    })) as TextureFlowNode[]
    const renderEdges = edgesRef.current

    for (const node of renderNodes) {
      const result = renderTextureGraph({
        nodes: renderNodes,
        edges: renderEdges,
        targetNodeId: node.id,
        width: NODE_PREVIEW_SIZE,
        height: NODE_PREVIEW_SIZE,
        time: currentTime,
        imageAssets,
      })

      context.putImageData(result.imageData, 0, 0)
      nextPreviews[node.id] = canvas.toDataURL('image/png')
    }

    frameId = window.requestAnimationFrame(() => {
      if (!cancelled) {
        setNodePreviewUrls(nextPreviews)
      }
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
    }
  }, [currentTime, imageAssets, previewSignature])

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((currentEdges) =>
        addEdge(
          {
            ...connection,
            id: `${connection.source}-${connection.target}-${Date.now()}`,
            type: 'smoothstep',
          },
          currentEdges,
        ),
      ),
    [setEdges],
  )

  const updateSelectedData = useCallback(
    (patch: Partial<TextureNodeData>) => {
      if (!selectedNode) {
        return
      }

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === selectedNode.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...patch,
                },
              }
            : node,
        ),
      )
    },
    [selectedNode, setNodes],
  )

  const applyVibeToSelected = useCallback(async () => {
    if (!selectedNode) {
      return
    }

    setIsGenerating(true)

    try {
      const texture = await requestVibeTexture(vibePrompt || selectedNode.data.prompt)
      setGenerationSource(texture.source)
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === selectedNode.id
            ? {
                ...node,
                type: 'textureCode',
                data: {
                  kind: 'code',
                  label: texture.label,
                  prompt: texture.prompt,
                  code: texture.code,
                  params: texture.params,
                },
              }
            : node,
        ),
      )
    } finally {
      setIsGenerating(false)
    }
  }, [selectedNode, setNodes, vibePrompt])

  const addCodeNode = useCallback(
    async (prompt = vibePrompt) => {
      setIsGenerating(true)

      try {
        const texture = await requestVibeTexture(prompt)
        setGenerationSource(texture.source)
        const id = makeId('code')
        const offset = nodes.length * 34
        const nextNode: TextureFlowNode = {
          id,
          type: 'textureCode',
          position: { x: 120 + offset, y: 300 + offset * 0.25 },
          data: toNodeData(texture),
        }

        setNodes((currentNodes) => [...currentNodes, nextNode])
        setSelectedNodeId(id)
      } finally {
        setIsGenerating(false)
      }
    },
    [nodes.length, setNodes, vibePrompt],
  )

  const addImageNode = useCallback(
    async (prompt = vibePrompt) => {
      setIsGenerating(true)

      try {
        const result = await requestFalTexture(prompt)
        setGenerationSource('fal')
        const id = makeId('image')
        const offset = nodes.length * 34
        const nextNode: TextureFlowNode = {
          id,
          type: 'imageNode',
          position: { x: 150 + offset, y: 360 + offset * 0.2 },
          data: {
            kind: 'image',
            label: result.texture.label,
            prompt: result.texture.prompt,
            code: '',
            params: {},
            imageUrl: result.texture.imageUrl,
          },
        }

        setNodes((currentNodes) => [...currentNodes, nextNode])
        setSelectedNodeId(id)
      } finally {
        setIsGenerating(false)
      }
    },
    [nodes.length, setNodes, vibePrompt],
  )

  const addOperationNode = useCallback(() => {
    const id = makeId('operation')
    const operation: TextureOperation = 'mix'
    const nextNode: TextureFlowNode = {
      id,
      type: 'operationNode',
      position: { x: 260 + nodes.length * 30, y: 250 + nodes.length * 10 },
      data: {
        kind: 'operation',
        label: getOperationLabel(operation),
        prompt: 'texture operation node',
        code: '',
        params: { amount: 0.5 },
        operation,
      },
    }

    setNodes((currentNodes) => [...currentNodes, nextNode])
    setSelectedNodeId(id)
  }, [nodes.length, setNodes])

  const addCompoundNode = useCallback(() => {
    const id = makeId('compound')
    const nextNode: TextureFlowNode = {
      id,
      type: 'compoundNode',
      position: { x: 220 + nodes.length * 28, y: 430 },
      data: {
        kind: 'compound',
        label: 'Compound Draft',
        prompt: 'reserved compound node',
        code: '',
        params: {},
      },
    }

    setNodes((currentNodes) => [...currentNodes, nextNode])
    setSelectedNodeId(id)
  }, [nodes.length, setNodes])

  const updateParam = useCallback(
    (name: string, value: number) => {
      if (!selectedNode) {
        return
      }

      updateSelectedData({
        params: {
          ...selectedNode.data.params,
          [name]: value,
        },
      })
    },
    [selectedNode, updateSelectedData],
  )

  const removeParam = useCallback(
    (name: string) => {
      if (!selectedNode) {
        return
      }

      const nextParams = { ...selectedNode.data.params }
      delete nextParams[name]
      updateSelectedData({ params: nextParams })
    },
    [selectedNode, updateSelectedData],
  )

  const addParam = useCallback(() => {
    const normalizedName = newParamName.trim().replace(/\s+/g, '_')

    if (!selectedNode || !normalizedName) {
      return
    }

    updateSelectedData({
      params: {
        ...selectedNode.data.params,
        [normalizedName]: 1,
      },
    })
    setNewParamName('')
  }, [newParamName, selectedNode, updateSelectedData])

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) {
      return
    }

    const nextSelectedId = nodes.find((node) => node.id !== selectedNode.id)?.id ?? ''

    setSelectedNodeId(nextSelectedId)
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== selectedNode.id))
    setEdges((currentEdges) =>
      currentEdges.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id),
    )
  }, [nodes, selectedNode, setEdges, setNodes])

  const resetWorkspace = useCallback(() => {
    const fresh = defaultFlow()
    window.localStorage.removeItem(STORAGE_KEY)
    setNodes(fresh.nodes)
    setEdges(fresh.edges)
    setSelectedNodeId(fresh.selectedNodeId)
    setRenderTick((value) => value + 1)
  }, [setEdges, setNodes])

  const exportPng = useCallback(() => {
    if (!previewNodeId) {
      return
    }

    const result = renderTextureGraph({
      nodes,
      edges,
      targetNodeId: previewNodeId,
      width: 1024,
      height: 1024,
      time: currentTime,
      imageAssets,
    })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    canvas.width = 1024
    canvas.height = 1024
    context?.putImageData(result.imageData, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) {
        return
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${selectedNode?.data.label ?? 'texture'}.png`
      link.click()
      URL.revokeObjectURL(url)
    })
  }, [currentTime, edges, imageAssets, nodes, previewNodeId, selectedNode])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Layers3 size={18} aria-hidden="true" />
          </div>
          <div>
            <h1>Procedural Texture Lab</h1>
            <span>React Flow · Code Nodes · Local Vibes</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button type="button" className="icon-button" onClick={() => addCodeNode()} title="Add code node">
            <Plus size={18} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={() => addImageNode()} title="Generate Fal image texture">
            <ImageIcon size={18} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={addOperationNode} title="Add operation node">
            <Blend size={18} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={addCompoundNode} title="Add compound node">
            <Boxes size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setRenderTick((value) => value + 1)}
            title="Render"
          >
            <Play size={18} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={exportPng} title="Export PNG">
            <Download size={18} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={resetWorkspace} title="Reset">
            <RefreshCcw size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <aside className="sidebar left-panel">
        <div className="panel-section">
          <div className="section-title">
            <Layers3 size={16} aria-hidden="true" />
            <h2>Layers</h2>
          </div>
          <div className="layer-list">
            {nodes.map((node) => (
              <button
                type="button"
                key={node.id}
                className={`layer-item ${node.id === previewNodeId ? 'is-active' : ''}`}
                onClick={() => setSelectedNodeId(node.id)}
              >
                <TextureCanvas
                  nodes={nodes}
                  edges={edges}
                  targetNodeId={node.id}
                  size={THUMB_SIZE}
                  time={currentTime}
                  imageAssets={imageAssets}
                />
                <span>
                  <strong>{node.data.label}</strong>
                  <small>{node.data.kind}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel-section">
          <div className="section-title">
            <WandSparkles size={16} aria-hidden="true" />
            <h2>AI Vibe</h2>
          </div>
          <textarea
            className="prompt-input"
            value={vibePrompt}
            onChange={(event) => setVibePrompt(event.target.value)}
            rows={5}
          />
          <div className="button-row">
            <button
              type="button"
              className="primary-button"
              onClick={applyVibeToSelected}
              disabled={isGenerating}
            >
              <WandSparkles size={16} aria-hidden="true" />
              {isGenerating ? '生成中' : '当前节点'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => addCodeNode(vibePrompt)}
              disabled={isGenerating}
            >
              <Plus size={16} aria-hidden="true" />
              新节点
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => addImageNode(vibePrompt)}
              disabled={isGenerating}
            >
              <ImageIcon size={16} aria-hidden="true" />
              图片
            </button>
          </div>
          <div className="ai-status">
            {generationSource === 'ai'
              ? 'AI SDK generated'
              : generationSource === 'fal'
                ? 'Fal image texture generated'
              : generationSource === 'local'
                ? 'Local fallback generated'
                : 'Uses OpenAI for code nodes and Fal for image texture nodes'}
          </div>
        </div>
      </aside>

      <main className="flow-panel">
        <ReactFlow
          nodes={flowNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[16, 16]}
          deleteKeyCode={['Backspace', 'Delete']}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#c8ced5" gap={18} size={1} variant={BackgroundVariant.Dots} />
          <Controls position="bottom-left" />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={(node) =>
              node.type === 'compoundNode' ? '#d98c2f' : node.type === 'operationNode' ? '#6b7fd7' : '#2c8b74'
            }
          />
        </ReactFlow>
      </main>

      <aside className="sidebar right-panel">
        <div className="preview-panel">
          <div className="section-title">
            <SlidersHorizontal size={16} aria-hidden="true" />
            <h2>Preview</h2>
          </div>
          {previewNodeId ? (
            <TextureCanvas
              nodes={nodes}
              edges={edges}
              targetNodeId={previewNodeId}
              size={PREVIEW_SIZE}
              time={currentTime}
              imageAssets={imageAssets}
              showError
            />
          ) : null}
        </div>

        {selectedNode ? (
          <>
            <div className="editor-field compact-field">
              <label htmlFor="node-name">Name</label>
              <input
                id="node-name"
                value={selectedNode.data.label}
                onChange={(event) => updateSelectedData({ label: event.target.value })}
              />
            </div>

            {selectedNode.data.kind === 'operation' ? (
              <div className="editor-field">
                <div className="field-heading">
                  <label htmlFor="node-operation">Operation</label>
                  <button type="button" className="ghost-button danger" onClick={deleteSelectedNode}>
                    <Trash2 size={15} aria-hidden="true" />
                    删除
                  </button>
                </div>
                <select
                  id="node-operation"
                  className="operation-select"
                  value={selectedNode.data.operation ?? 'mix'}
                  onChange={(event) => {
                    const operation = event.target.value as TextureOperation
                    updateSelectedData({
                      operation,
                      label: getOperationLabel(operation),
                      params: {
                        amount:
                          operation === 'add' || operation === 'sub' || operation === 'mul' || operation === 'div'
                            ? 1
                            : (selectedNode.data.params.amount ?? 0.5),
                      },
                    })
                  }}
                >
                  {operationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="operation-io">
                  <span>A</span>
                  <span>B</span>
                  <strong>{selectedNode.data.operation ?? 'mix'}</strong>
                </div>
              </div>
            ) : selectedNode.data.kind === 'image' ? (
              <div className="editor-field">
                <div className="field-heading">
                  <label htmlFor="node-image-url">Image Texture</label>
                  <button type="button" className="ghost-button danger" onClick={deleteSelectedNode}>
                    <Trash2 size={15} aria-hidden="true" />
                    删除
                  </button>
                </div>
                <input
                  id="node-image-url"
                  value={selectedNode.data.imageUrl ?? ''}
                  onChange={(event) => updateSelectedData({ imageUrl: event.target.value })}
                />
                <div className="operation-io single-line">
                  <strong>Fal bitmap source</strong>
                </div>
              </div>
            ) : (
              <div className="editor-field">
                <div className="field-heading">
                  <label htmlFor="node-code">Code</label>
                  <button type="button" className="ghost-button danger" onClick={deleteSelectedNode}>
                    <Trash2 size={15} aria-hidden="true" />
                    删除
                  </button>
                </div>
                <textarea
                  id="node-code"
                  className="code-editor"
                  spellCheck={false}
                  value={selectedNode.data.code}
                  onChange={(event) => updateSelectedData({ code: event.target.value })}
                  disabled={selectedNode.data.kind === 'compound'}
                />
              </div>
            )}

            <div className="panel-section params-section">
              <div className="section-title">
                <SlidersHorizontal size={16} aria-hidden="true" />
                <h2>Params</h2>
              </div>
              <div className="params-list">
                {Object.entries(selectedNode.data.params).map(([name, value]) => (
                  <label className="param-row" key={name}>
                    <span>{name}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={value}
                      onChange={(event) => updateParam(name, Number(event.target.value))}
                    />
                    <button type="button" className="param-remove" onClick={() => removeParam(name)}>
                      <X size={14} aria-hidden="true" />
                    </button>
                  </label>
                ))}
              </div>
              <div className="add-param-row">
                <input
                  value={newParamName}
                  onChange={(event) => setNewParamName(event.target.value)}
                  placeholder="param_name"
                />
                <button type="button" className="secondary-button icon-compact" onClick={addParam}>
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="io-contract">
              <strong>IO</strong>
              <code>texture-code-v1</code>
              <code>uv.mul(n).fract()</code>
              <code>add/sub/mul/div</code>
              <code>input(index, fallback, uv)</code>
              <code>return rgb/rgba/hsl</code>
            </div>
          </>
        ) : null}
      </aside>
    </div>
  )
}

function App() {
  return (
    <ReactFlowProvider>
      <AppWorkbench />
    </ReactFlowProvider>
  )
}

export default App
