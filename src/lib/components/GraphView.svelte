<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowLeft, Share2 } from "lucide-svelte";
  import { getVault, getUI } from "$lib/stores.svelte";
  import { surfaceEnter } from "$lib/motion/actions";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import IconButton from "$lib/components/ui/IconButton.svelte";
  import PanelHeader from "$lib/components/ui/PanelHeader.svelte";

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
  let prefersReducedMotion = false;

  function hashStem(stem: string) {
    let hash = 0;
    for (const character of stem) {
      hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    }
    return hash;
  }

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

    for (let index = 0; index < vault.fileNames.length; index++) {
      const stem = vault.fileNames[index];
      const hash = hashStem(stem);
      const angle =
        (index / Math.max(1, vault.fileNames.length)) * Math.PI * 2 +
        ((hash % 101) / 101) * 0.55;
      const depth = 0.13 + ((hash >> 8) % 100) / 360;
      const r = Math.min(width, height) * depth;
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
    if (!prefersReducedMotion) startSimulation();
  }

  function renderStatic() {
    nodeEls.clear();
    lineEls = [];
    if (!svgEl) return;

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

    for (const edge of edges) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute(
        "stroke",
        "color-mix(in oklab, var(--color-primary) 13%, transparent)",
      );
      line.setAttribute("stroke-width", "0.75");
      line.setAttribute("class", "graph-link");
      svgEl.appendChild(line);
      lineEls.push(line);
    }

    for (const node of nodes) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("role", "button");
      g.setAttribute("tabindex", "0");
      g.setAttribute("aria-label", `Open ${node.id}`);
      g.setAttribute("class", "graph-node");
      g.style.cursor = "pointer";
      g.style.transition =
        "opacity var(--vellum-motion-normal) var(--vellum-ease-out)";

      const visual = document.createElementNS("http://www.w3.org/2000/svg", "g");
      visual.setAttribute("class", "node-visual");
      visual.style.transition =
        "transform var(--vellum-motion-normal) var(--vellum-ease-out)";

      const orbit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      orbit.setAttribute("r", "15");
      orbit.setAttribute("fill", "none");
      orbit.setAttribute(
        "stroke",
        "color-mix(in oklab, var(--color-primary) 16%, transparent)",
      );
      orbit.setAttribute("stroke-width", "0.75");
      orbit.setAttribute("stroke-dasharray", "2 4");
      orbit.setAttribute("class", "node-orbit");
      visual.appendChild(orbit);

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", "7");
      circle.setAttribute(
        "fill",
        "color-mix(in oklab, var(--vellum-surface-overlay) 72%, transparent)",
      );
      circle.setAttribute(
        "stroke",
        "color-mix(in oklab, var(--color-primary) 48%, transparent)",
      );
      circle.setAttribute("stroke-width", "1");
      circle.setAttribute("class", "node-core");
      visual.appendChild(circle);

      const point = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      point.setAttribute("r", "1.75");
      point.setAttribute("fill", "var(--color-primary)");
      point.setAttribute("class", "node-point");
      visual.appendChild(point);
      g.appendChild(visual);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("y", "26");
      text.setAttribute("class", "node-label");
      text.setAttribute(
        "fill",
        "color-mix(in oklab, var(--color-base-content) 66%, transparent)",
      );
      text.style.pointerEvents = "none";
      text.textContent = node.id;
      g.appendChild(text);

      g.addEventListener("mouseenter", () => setHovered(node.id));
      g.addEventListener("mouseleave", () => setHovered(null));
      g.addEventListener("focus", () => setHovered(node.id));
      g.addEventListener("blur", () => setHovered(null));
      g.addEventListener("click", () => vault.openByStem(node.id));
      g.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        void vault.openByStem(node.id);
      });

      svgEl.appendChild(g);
      nodeEls.set(node.id, g);
    }

    syncPositions();
  }

  function syncPositions() {
    for (const node of nodes) {
      const el = nodeEls.get(node.id);
      if (!el) continue;
      el.setAttribute("transform", `translate(${node.x} ${node.y})`);
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
      el.style.opacity = id && !isConnected ? "0.16" : "1";
      const visual = el.querySelector<SVGGElement>(".node-visual")!;
      visual.style.transform = isHovered ? "scale(1.35)" : "scale(1)";
      visual.style.transformOrigin = "center";
      const circle = el.querySelector<SVGCircleElement>(".node-core")!;
      circle.setAttribute(
        "stroke",
        isHovered
          ? "var(--color-primary)"
          : "color-mix(in oklab, var(--color-primary) 48%, transparent)",
      );
      const text = el.querySelector("text")!;
      text.style.fill = isHovered
        ? "var(--color-primary)"
        : "color-mix(in oklab, var(--color-base-content) 66%, transparent)";
      text.style.fontWeight = isHovered ? "650" : "480";
    }
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const line = lineEls[i];
      const isConn = id ? (connected!.has(e.source) && connected!.has(e.target)) : false;
      line.setAttribute(
        "stroke",
        isConn
          ? "var(--color-primary)"
          : "color-mix(in oklab, var(--color-primary) 13%, transparent)",
      );
      line.setAttribute("stroke-width", id && connected!.has(e.source) ? "1.25" : "0.75");
      line.style.opacity = id && !isConn ? "0.14" : "1";
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
    prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
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

<div bind:this={container} class="flex h-full flex-col overflow-hidden">
  <PanelHeader title="Knowledge Graph" page>
    {#snippet leading()}
      <IconButton
        label="Back to editor"
        title="Back"
        onclick={() => (ui.currentView = "editor")}
      >
        <ArrowLeft class="ui-icon ui-icon--lg" />
      </IconButton>
    {/snippet}
    {#snippet meta()}
      {noteCount} notes, {linkCount} links
    {/snippet}
  </PanelHeader>

  <div use:surfaceEnter={{ y: 8, scale: 0.998 }} class="graph-space ui-surface-canvas relative flex-1 overflow-hidden">
    <div class="depth-field" aria-hidden="true"></div>
    {#if noteCount === 0}
      <div class="flex h-full items-center justify-center">
        <EmptyState
          title="No graph to display"
          description="Open a vault to see connections between documents."
        >
          {#snippet icon()}
            <Share2 class="ui-icon ui-icon--lg" />
          {/snippet}
        </EmptyState>
      </div>
    {:else}
      <svg
        class="graph-svg"
        bind:this={svgEl}
        width={width}
        height={height}
        viewBox="0 0 {width} {height}"
        aria-label="Document connection graph"
      ></svg>
    {/if}
  </div>
</div>

<style>
  .graph-space {
    isolation: isolate;
    background:
      linear-gradient(
        145deg,
        color-mix(in oklab, var(--vellum-glass-specular) 16%, transparent),
        transparent 28%
      ),
      radial-gradient(
        circle at 50% 48%,
        color-mix(in oklab, var(--color-primary) 10%, transparent),
        transparent 34%
      );
  }

  .depth-field {
    position: absolute;
    inset: 8%;
    z-index: 0;
    pointer-events: none;
    border-radius: 50%;
    background: radial-gradient(
      ellipse,
      color-mix(in oklab, var(--color-primary) 4%, transparent),
      transparent 64%
    );
    opacity: 0.45;
    transform: perspective(700px) rotateX(62deg) scale(1.15);
  }

  .depth-field::before,
  .depth-field::after {
    display: none;
  }

  .graph-svg {
    position: relative;
    z-index: 1;
  }

  .graph-svg :global(.graph-link) {
    transition:
      opacity var(--vellum-motion-normal) var(--vellum-ease-out),
      stroke var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .graph-svg :global(.node-visual) {
    transform-box: fill-box;
  }

  .graph-svg :global(.node-orbit) {
    opacity: 0.72;
  }

  .graph-svg :global(.node-label) {
    font-family: var(--vellum-font-ui);
    font-size: var(--vellum-text-caption);
    letter-spacing: 0.035em;
    paint-order: stroke;
    stroke: color-mix(in oklab, var(--vellum-surface-app) 86%, transparent);
    stroke-width: 3px;
    transition:
      fill var(--vellum-motion-fast) var(--vellum-ease-out),
      opacity var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .graph-svg :global(.graph-node:focus-visible .node-core) {
    stroke: var(--color-primary);
    stroke-width: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .graph-svg :global(.graph-link),
    .graph-svg :global(.node-visual),
    .graph-svg :global(.node-label) {
      transition: none;
    }
  }
</style>