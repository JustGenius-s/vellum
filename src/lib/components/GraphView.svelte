<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowLeft } from "lucide-svelte";

  let {
    stems = [] as string[],
    links = {} as Record<string, string[]>,
    onOpen = (_stem: string) => {},
    onBack = () => {},
  }: {
    stems: string[];
    links: Record<string, string[]>;
    onOpen: (stem: string) => void;
    onBack: () => void;
  } = $props();

  let width = $state(800);
  let height = $state(600);
  let container: HTMLDivElement;

  interface Node {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
  }

  interface Edge {
    source: string;
    target: string;
  }

  let nodes = $state<Node[]>([]);
  let edgeList = $state<Edge[]>([]);
  let hovered = $state<string | null>(null);
  let frameId: number | null = null;
  let settled = $state(false);

  function initGraph() {
    const nodeMap = new Map<string, Node>();
    const edges: Edge[] = [];
    const cx = width / 2;
    const cy = height / 2;

    for (const stem of stems) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * Math.min(width, height) * 0.2;
      nodeMap.set(stem, {
        id: stem,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
      });
    }

    for (const [target, sources] of Object.entries(links)) {
      if (!nodeMap.has(target)) continue;
      for (const source of sources) {
        if (!nodeMap.has(source)) continue;
        if (source === target) continue;
        edges.push({ source, target });
      }
    }

    nodes = Array.from(nodeMap.values());
    edgeList = edges;
    settled = false;
    frameId = requestAnimationFrame(simulate);
  }

  let prevWidth = $state(0);
  let prevHeight = $state(0);

  $effect(() => {
    if (stems.length > 0) {
      height = container.clientHeight;
      width = container.clientWidth;
      initGraph();
    }
  });

  function simulate() {
    if (nodes.length === 0) return;

    const alpha = 0.5;
    const repulsion = 3000;
    const attraction = 0.01;
    const centering = 0.005;
    const damping = 0.85;
    const minDist = 40;

    // Zero forces
    for (const n of nodes) {
      n.vx = 0;
      n.vy = 0;
    }

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[i].x - nodes[j].x;
        let dy = nodes[i].y - nodes[j].y;
        const dist = Math.max(minDist, Math.sqrt(dx * dx + dy * dy));
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx += fx;
        nodes[i].vy += fy;
        nodes[j].vx -= fx;
        nodes[j].vy -= fy;
      }
    }

    // Attraction
    for (const e of edgeList) {
      const s = nodes.find((n) => n.id === e.source);
      const t = nodes.find((n) => n.id === e.target);
      if (!s || !t) continue;
      const dx = s.x - t.x;
      const dy = s.y - t.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const force = dist * attraction;
      const fx = (dx / Math.max(1, dist)) * force;
      const fy = (dy / Math.max(1, dist)) * force;
      s.vx -= fx;
      s.vy -= fy;
      t.vx += fx;
      t.vy += fy;
    }

    // Centering
    const cx = width / 2;
    const cy = height / 2;
    for (const n of nodes) {
      n.vx += (cx - n.x) * centering;
      n.vy += (cy - n.y) * centering;
    }

    // Update positions
    let totalEnergy = 0;
    for (const n of nodes) {
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx * alpha;
      n.y += n.vy * alpha;
      n.x = Math.max(60, Math.min(width - 60, n.x));
      n.y = Math.max(30, Math.min(height - 30, n.y));
      totalEnergy += Math.abs(n.vx) + Math.abs(n.vy);
    }

    nodes = nodes;

    if (totalEnergy > 0.5) {
      frameId = requestAnimationFrame(simulate);
    } else {
      settled = true;
      frameId = null;
    }
  }

  onMount(() => {
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  });

  function connectedNodes(stem: string): Set<string> {
    const set = new Set<string>();
    set.add(stem);
    for (const [target, sources] of Object.entries(links)) {
      if (target === stem) for (const s of sources) set.add(s);
      if (sources.includes(stem)) set.add(target);
    }
    return set;
  }

  let connected = $derived(hovered ? connectedNodes(hovered) : new Set<string>());
</script>

<div bind:this={container} class="flex flex-col h-full overflow-hidden">
  <div class="flex items-center gap-3 border-b border-base-300 bg-base-200/50 px-4 py-2 shrink-0">
    <button class="btn btn-ghost btn-sm btn-square" onclick={onBack} title="Back">
      <ArrowLeft size={18} />
    </button>
    <h1 class="text-lg font-semibold">Knowledge Graph</h1>
    <span class="text-xs text-base-content/50 ml-auto">{nodes.length} notes, {edgeList.length} links</span>
  </div>

  <div class="flex-1 bg-base-100 overflow-hidden relative">
    {#if stems.length === 0}
      <div class="flex items-center justify-center h-full text-base-content/40 text-sm">
        Open a vault to see the graph
      </div>
    {:else}
      <svg width={width} height={height} viewBox="0 0 {width} {height}">
        {#each edgeList as edge (edge.source + "->" + edge.target)}
          {@const s = nodes.find((n) => n.id === edge.source)}
          {@const t = nodes.find((n) => n.id === edge.target)}
          {#if s && t}
            <line
              x1={s.x} y1={s.y} x2={t.x} y2={t.y}
              stroke={hovered && (connected.has(edge.source) && connected.has(edge.target)) ? "oklch(var(--p))" : "oklch(var(--bc) / 0.15)"}
              stroke-width={hovered && connected.has(edge.source) ? "1.5" : "0.8"}
            />
          {/if}
        {/each}

        {#each nodes as node (node.id)}
          {@const isHovered = hovered === node.id}
          {@const isConnected = hovered ? connected.has(node.id) : true}
          <g
            role="button"
            tabindex="0"
            class="cursor-pointer transition-opacity"
            style="opacity: {hovered && !isConnected ? '0.2' : '1'}"
            onmouseenter={() => (hovered = node.id)}
            onmouseleave={() => (hovered = null)}
            onclick={() => onOpen(node.id)}
            onkeydown={(e) => { if (e.key === 'Enter') onOpen(node.id); }}
          >
            <circle
              cx={node.x} cy={node.y}
              r={isHovered ? 16 : 10}
              fill="oklch(var(--b1))"
              stroke={isHovered ? "oklch(var(--p))" : "oklch(var(--bc) / 0.3)"}
              stroke-width={isHovered ? "3" : "1.5"}
            />
            <text
              x={node.x} y={node.y + 22}
              text-anchor="middle"
              class="text-xs fill-base-content/70 pointer-events-none"
              style="font-weight: {isHovered ? '600' : '400'}"
            >
              {node.id}
            </text>
          </g>
        {/each}
      </svg>
    {/if}
  </div>
</div>
