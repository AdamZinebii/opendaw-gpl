// graph-runtime.ts
import ForceGraph from "force-graph"
import * as d3 from "d3-force"

export type GraphData = {
    nodes: { id: string; label?: string }[]
    edges: { source: string; target: string }[]
}

export type CreateGraphPanel =
    (canvas: HTMLCanvasElement, data: GraphData, opts?: { dark?: boolean }) => {
        terminate(): void
        resize(): void
    }

// Remove trailing " Box" or "Box" from labels (no leftover space)
const stripBoxSuffix = (label?: string): string => {
    if (!label) return ""
    if (label.endsWith(" Box")) return label.slice(0, -4)
    if (label.endsWith("Box")) return label.slice(0, -3)
    return label
}

export const createGraphPanel: CreateGraphPanel = (canvas, data, opts = {}) => {
    const dark = !!opts.dark

    // ---- Convert to force-graph data shape ----
    const nodes = data.nodes.map(n => ({id: n.id, label: stripBoxSuffix(n.label)}))
    const links = data.edges.map(e => ({source: e.source, target: e.target}))

    // ---- Degree map for sizing & heatmap coloring ----
    const degree = new Map<string, number>()
    for (const n of nodes) degree.set(n.id, 0)
    for (const l of links) {
        degree.set(l.source as string, (degree.get(l.source as string) || 0) + 1)
        degree.set(l.target as string, (degree.get(l.target as string) || 0) + 1)
    }
    const degVals = Array.from(degree.values())
    const minDeg = degVals.length ? Math.min(...degVals) : 0
    const maxDeg = degVals.length ? Math.max(...degVals) : 1
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    // Hover state
    let hovered: any = null

    // ---- Init ForceGraph ----
    const fg = new (ForceGraph as any)(canvas)
        .graphData({nodes, links} as any)
        .backgroundColor(dark ? "#0e0f12" : "#ffffff")
        .nodeId("id")
        .linkSource("source")
        .linkTarget("target")
        .nodeRelSize(6)
        .enableNodeDrag(true)
        .autoPauseRedraw(false)
        .linkColor(() => (dark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)"))
        .linkWidth(1)
        // size by degree (capped so hubs don’t get giant)
        .nodeVal((n: any) => Math.min(18, 4 + (degree.get(n.id) || 0) * 2))
        // heatmap color by degree: blue (low) → red (high)
        .nodeColor((n: any) => {
            const d = degree.get(n.id) ?? 0
            const t = (d - minDeg) / Math.max(1, maxDeg - minDeg)
            const hue = lerp(240, 0, t) // 240=blue → 0=red
            return `hsl(${hue}, 100%, 50%)`
        })
        // draw labels ourselves on top:
        .nodeCanvasObjectMode(() => "after")
        .nodeCanvasObject((_node: any, _ctx: CanvasRenderingContext2D) => {
            /* labels drawn in onRenderFramePost */
        })
        // update hover state
        .onNodeHover((node: any) => {
            hovered = node || null
        })

    // ---- Draw labels centered & on top, with zoom-based visibility + hover always ----
    fg.onRenderFramePost((ctx: CanvasRenderingContext2D) => {
        const zoom: number = fg.zoom?.() ?? 1
        const threshold = 1.2

        const drawPill = (x: number, y: number, text: string) => {
            const padX = 6
            const padY = 3
            const tw = ctx.measureText(text).width
            const w = tw + padX * 2
            const h = 16 + padY * 2
            const rx = 6
            ctx.beginPath()
            ctx.moveTo(x - w / 2 + rx, y - h / 2)
            ctx.lineTo(x + w / 2 - rx, y - h / 2)
            ctx.quadraticCurveTo(x + w / 2, y - h / 2, x + w / 2, y - h / 2 + rx)
            ctx.lineTo(x + w / 2, y + h / 2 - rx)
            ctx.quadraticCurveTo(x + w / 2, y + h / 2, x + w / 2 - rx, y + h / 2)
            ctx.lineTo(x - w / 2 + rx, y + h / 2)
            ctx.quadraticCurveTo(x - w / 2, y + h / 2, x - w / 2, y + h / 2 - rx)
            ctx.lineTo(x - w / 2, y - h / 2 + rx)
            ctx.quadraticCurveTo(x - w / 2, y - h / 2, x - w / 2 + rx, y - h / 2)
            ctx.closePath()
            ctx.fillStyle = dark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.8)"
            ctx.fill()
            ctx.strokeStyle = dark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)"
            ctx.stroke()
            ctx.fillStyle = dark ? "#ffffff" : "#000000"
            ctx.fillText(text, x, y)
        }

        ctx.save()
        const fontSize = 12 / zoom
        ctx.font = `${fontSize}px system-ui, -apple-system, Segoe UI, Roboto`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillStyle = "#ffffff"

        const g = fg.graphData() as { nodes: Array<any> }

        // Show labels for all nodes only when zoomed in enough
        if (zoom >= threshold) {
            for (const n of g.nodes) {
                if (typeof n.x !== "number" || typeof n.y !== "number") continue
                const label = n.label as string | undefined
                if (!label) continue
                ctx.fillText(label, n.x, n.y)
            }
        }

        // Always show hovered node label (with a pill), regardless of zoom
        if (hovered && typeof hovered.x === "number" && typeof hovered.y === "number") {
            const text = hovered.label ?? hovered.id
            drawPill(hovered.x, hovered.y - 18 / zoom, text)
        }

        ctx.restore()
    })

    // ---- Forces: avoid “pile”, get nice islands ----
    fg.d3Force("charge", d3.forceManyBody().strength(-150))
    fg.d3Force("link", d3.forceLink<any, any>()
        .id((n: any) => n.id)
        .distance(70)
        .strength(0.8)
    )
    fg.d3Force("center", d3.forceCenter(0, 0))

    // ---- Resize handling ----
    const applySize = () => {
        const rect = canvas.getBoundingClientRect()
        if (rect.width && rect.height) fg.width(rect.width).height(rect.height)
    }
    const ro = new ResizeObserver(applySize)
    ro.observe(canvas)
    applySize()

    return {
        terminate(): void {
            try { ro.disconnect() } catch {}
            try { fg.graphData({nodes: [], links: []}) } catch {}
        },
        resize(): void {
            applySize()
        }
    }
}
