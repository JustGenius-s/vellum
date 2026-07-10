<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowLeft } from "lucide-svelte";
  import { getVault, getUI } from "$lib/stores.svelte";

  const vault = getVault();
  const ui = getUI();

  let container = $state<HTMLDivElement>();
  let svgEl = $state<SVGSVGElement>();
  let nodeEls = new Map<string, SVGGElement>();
  let lineEls: SVGLineElement[] = [];

  interface GNode {
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

  let nodes: GNode[] = [];
  let edges: Edge[] = [];
  let width = $state(800);
  let height = $state(600);
  let frameId: number | null = null;
  let hovered: string | null = null;

  function connectedNodes(stem: string): Set<string> {
    const set = new Set<string>();
    set.add(stem);
    for (const [target, sources] of Object.entries(vault.backlinkIndex)) {
      if (target === stem) for (const s of sources) set.add(s);
      if (sources.includes(stem)) set.add(target);
    }
    return set;
  }

  function initGraph() {
    const nodeMap = new Map<string, GNode>();
    edges = [];
    const cx = width / 2;
    const cy = height / 2;

    for (const stem of vault.fileNames) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * Math.min(width, height) * 0.2;
      nodeMap.set(stem, { id: stem, x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, vx: 0, vy: 0 });
    }

    for (const [target, sources] of Object.entries(vault.backlinkIndex)) {
      if (!nodeMap.has(target)) continue;
      for (const source of sources) {
        if (!nodeMap.has(source) || source === target) continue;
        edges.push({ source, target });
      }
    }

    nodes = Array.from(nodeMap.values());
    renderStatic();
    startSimulation();
  }

  function renderStatic() {
    nodeEls.clear();
    lineEls = [];
    if (!svgEl) return;

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

    for (const edge of edges) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("stroke", "oklch(var(--bc) / 0.15)");
      line.setAttribute("stroke-width", "0.8");
      svgEl.appendChild(line);
      lineEls.push(line);
    }

    for (const node of nodes) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("role", "button");
      g.setAttribute("tabindex", "0");
      g.style.cursor = "pointer";
      g.style.transition = "opacity 0.2s";

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", "10");
      circle.setAttribute("fill", "oklch(var(--b1))");
      circle.setAttribute("stroke", "oklch(var(--bc) / 0.3)");
      circle.setAttribute("stroke-width", "1.5");
      g.appendChild(circle);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("y", "22");
      text.setAttribute("class", "text-xs fill-base-content/70");
      text.style.pointerEvents = "none";
      text.textContent = node.id;
      g.appendChild(text);

      g.addEventListener("mouseenter", () => setHovered(node.id));
      g.addEventListener("mouseleave", () => setHovered(null));
      g.addEventListener("click", () => vault.openByStem(node.id));

      svgEl.appendChild(g);
      nodeEls.set(node.id, g);
    }

    syncPositions();
  }

  function syncPositions() {
    for (const node of nodes) {
      const el = nodeEls.get(node.id);
      if (!el) continue;
      const circle = el.querySelector("circle")!;
      const text = el.querySelector("text")!;
      circle.setAttribute("cx", String(node.x));
      circle.setAttribute("cy", String(node.y));
      text.setAttribute("x", String(node.x));
      text.setAttribute("y", String(node.y + 22));
    }
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const s = nodes.find((n) => n.id === e.source);
      const t = nodes.find((n) => n.id === e.target);
      if (!s || !t) continue;
      const line = lineEls[i];
      line.setAttribute("x1", String(s.x));
      line.setAttribute("y1", String(s.y));
      line.setAttribute("x2", String(t.x));
      line.setAttribute("y2", String(t.y));
    }
  }

  function startSimulation() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(simulate);
  }

  function simulate() {
    if (nodes.length === 0) return;

    const alpha = 0.5;
    const repulsion = 3000;
    const attraction = 0.01;
    const centering = 0.005;
    const damping = 0.85;
    const minDist = 40;

    for (const n of nodes) { n.vx = 0; n.vy = 0; }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.max(minDist, Math.sqrt(dx * dx + dy * dy));
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx += fx; nodes[i].vy += fy;
        nodes[j].vx -= fx; nodes[j].vy -= fy;
      }
    }

    for (const e of edges) {
      const s = nodes.find((n) => n.id === e.source);
      const t = nodes.find((n) => n.id === e.target);
      if (!s || !t) continue;
      const dx = s.x - t.x;
      const dy = s.y - t.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const force = dist * attraction;
      const fx = (dx / Math.max(1, dist)) * force;
      const fy = (dy / Math.max(1, dist)) * force;
      s.vx -= fx; s.vy -= fy;
      t.vx += fx; t.vy += fy;
    }

    const cx = width / 2;
    const cy = height / 2;
    let totalEnergy = 0;
    for (const n of nodes) {
      n.vx += (cx - n.x) * centering;
      n.vy += (cy - n.y) * centering;
      n.vx *= damping; n.vy *= damping;
      n.x += n.vx * alpha;
      n.y += n.vy * alpha;
      n.x = Math.max(60, Math.min(width - 60, n.x));
      n.y = Math.max(30, Math.min(height - 30, n.y));
      totalEnergy += Math.abs(n.vx) + Math.abs(n.vy);
    }

    syncPositions();

    if (totalEnergy > 0.5) {
      frameId = requestAnimationFrame(simulate);
    } else {
      frameId = null;
    }
  }

  function setHovered(id: string | null) {
    hovered = id;
    const connected = id ? connectedNodes(id) : null;
    for (const node of nodes) {
      const el = nodeEls.get(node.id);
      if (!el) continue;
      const isHovered = id === node.id;
      const isConnected = id ? connected!.has(node.id) : true;
      el.style.opacity = id && !isConnected ? "0.2" : "1";
      const circle = el.querySelector("circle")!;
      circle.setAttribute("r", isHovered ? "16" : "10");
      circle.setAttribute("stroke", isHovered ? "oklch(var(--p))" : "oklch(var(--bc) / 0.3)");
      circle.setAttribute("stroke-width", isHovered ? "3" : "1.5");
      const text = el.querySelector("text")!;
      text.style.fontWeight = isHovered ? "600" : "400";
    }
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const line = lineEls[i];
      const isConn = id ? (connected!.has(e.source) && connected!.has(e.target)) : false;
      line.setAttribute("stroke", isConn ? "oklch(var(--p))" : "oklch(var(--bc) / 0.15)");
      line.setAttribute("stroke-width", id && connected!.has(e.source) ? "1.5" : "0.8");
    }
  }

  let noteCount = $derived(vault.fileNames.length);
  let linkCount = $derived(Object.values(vault.backlinkIndex).flat().length);

  let lastStems = "";
  let lastLinks = "";

  $effect(() => {
    void vault.fileNames;
    void vault.backlinkIndex;
    const stems = vault.fileNames.join(",");
    const links = JSON.stringify(vault.backlinkIndex);
    if (stems !== lastStems || links !== lastLinks) {
      lastStems = stems;
      lastLinks = links;
      if (vault.fileNames.length > 0 && container) {
        height = container.clientHeight;
        width = container.clientWidth;
        initGraph();
      }
    }
  });

  onMount(() => {
    const ro = new ResizeObserver(() => {
      if (!container) return;
      height = container.clientHeight;
      width = container.clientWidth;
      if (svgEl) {
        svgEl.setAttribute("width", String(width));
        svgEl.setAttribute("height", String(height));
        svgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
      }
    });
    if (container) ro.observe(container);

    if (vault.fileNames.length > 0 && container) {
      height = container.clientHeight;
      width = container.clientWidth;
      initGraph();
    }

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      ro.disconnect();
    };
  });
</script>

<div bind:this={container} class="flex flex-col h-full overflow-hidden">
  <div class="flex items-center gap-3 border-b border-base-300 bg-base-200/50 px-4 py-2 shrink-0">
    <button class="btn btn-ghost btn-sm btn-square" onclick={() => (ui.currentView = "editor")} title="Back">
      <ArrowLeft class="ui-icon ui-icon--lg" />
    </button>
    <h1 class="text-lg font-semibold">Knowledge Graph</h1>
    <span class="text-xs text-base-content/50 ml-auto">{noteCount} notes, {linkCount} links</span>
  </div>

  <div class="flex-1 bg-base-100 overflow-hidden relative">
    {#if noteCount === 0}
      <div class="flex items-center justify-center h-full text-base-content/40 text-sm">
        Open a vault to see the graph
      </div>
    {:else}
      <svg bind:this={svgEl} width={width} height={height} viewBox="0 0 {width} {height}"></svg>
    {/if}
  </div>
</div>