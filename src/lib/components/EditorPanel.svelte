<script lang="ts">
  import CodeMirror from "$lib/components/CodeMirror.svelte";
  import { X, ChevronUp, ChevronDown, Replace } from "lucide-svelte";
  import type { EditorView } from "@codemirror/view";
  import { vault, ui } from "$lib/stores.svelte";

  let findOpen = $state(false);
  let findQuery = $state("");
  let replaceOpen = $state(false);
  let replaceQuery = $state("");
  let matchPositions = $state<number[]>([]);
  let currentMatchIdx = $state(0);
  let view = $state<EditorView | null>(null);
  let findInput = $state<HTMLInputElement>();

  $effect(() => {
    if (ui.findPanelOpen) {
      openFind();
    }
  });

  function onViewCreated(v: EditorView) {
    view = v;
  }

  function doFind() {
    if (!view || !findQuery) {
      matchPositions = [];
      currentMatchIdx = 0;
      return;
    }
    const text = view.state.doc.toString();
    const q = findQuery;
    const positions: number[] = [];
    let idx = 0;
    while ((idx = text.indexOf(q, idx)) !== -1) {
      positions.push(idx);
      idx += q.length;
    }
    matchPositions = positions;
    currentMatchIdx = 0;
    if (positions.length > 0) {
      goToMatch(0);
    }
  }

  function onFindInput() {
    doFind();
  }

  function goToMatch(idx: number) {
    if (!view || matchPositions.length === 0) return;
    currentMatchIdx = ((idx % matchPositions.length) + matchPositions.length) % matchPositions.length;
    const pos = matchPositions[currentMatchIdx];
    view.dispatch({
      selection: { anchor: pos, head: pos + findQuery.length },
      scrollIntoView: true,
    });
  }

  function nextMatch() {
    goToMatch(currentMatchIdx + 1);
  }

  function prevMatch() {
    goToMatch(currentMatchIdx - 1);
  }

  function replaceOne() {
    if (!view || matchPositions.length === 0) return;
    const pos = matchPositions[currentMatchIdx];
    const newText = view.state.doc.toString().slice(0, pos) + replaceQuery + view.state.doc.toString().slice(pos + findQuery.length);
    vault.onSourceChange(newText);
    setTimeout(() => {
      findQuery = findQuery;
      doFind();
    }, 0);
  }

  function replaceAll() {
    if (!view || !findQuery) return;
    const newText = view.state.doc.toString().split(findQuery).join(replaceQuery);
    vault.onSourceChange(newText);
    closeFind();
  }

  function openFind() {
    findOpen = true;
    replaceOpen = false;
    setTimeout(() => findInput?.focus(), 50);
  }

  function closeFind() {
    findOpen = false;
    replaceOpen = false;
    findQuery = "";
    replaceQuery = "";
    matchPositions = [];
    ui.findPanelOpen = false;
  }

  function toggleReplace() {
    replaceOpen = !replaceOpen;
  }

  function handleFindKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) prevMatch();
      else nextMatch();
    } else if (e.key === "Escape") {
      closeFind();
    }
  }
</script>

<div class="flex flex-col h-full overflow-hidden">
  <div class="flex-1 overflow-hidden">
    <CodeMirror source={vault.source} fileNames={vault.fileNames} onchange={(v) => vault.onSourceChange(v)} {onViewCreated} />
  </div>

  {#if findOpen}
    <div class="border-t border-base-300 bg-base-200 px-3 py-2 flex items-center gap-2 shrink-0">
      <div class="relative flex-1 max-w-xs">
        <input
          bind:this={findInput}
          type="text"
          placeholder="Find..."
          bind:value={findQuery}
          oninput={onFindInput}
          onkeydown={handleFindKeydown}
          class="input input-bordered input-sm w-full pr-8"
        />
        {#if matchPositions.length > 0}
          <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-base-content/50 tabular-nums">
            {currentMatchIdx + 1}/{matchPositions.length}
          </span>
        {/if}
      </div>

      <button class="btn btn-ghost btn-xs btn-square" onclick={prevMatch} title="Previous match" disabled={matchPositions.length === 0}>
        <ChevronUp size={14} />
      </button>
      <button class="btn btn-ghost btn-xs btn-square" onclick={nextMatch} title="Next match" disabled={matchPositions.length === 0}>
        <ChevronDown size={14} />
      </button>

      <button class="btn btn-ghost btn-xs btn-square {replaceOpen ? 'btn-active' : ''}" onclick={toggleReplace} title="Toggle replace">
        <Replace size={14} />
      </button>

      <button class="btn btn-ghost btn-xs btn-square" onclick={closeFind} title="Close find">
        <X size={14} />
      </button>

      {#if replaceOpen}
        <input
          type="text"
          placeholder="Replace..."
          bind:value={replaceQuery}
          onkeydown={(e) => { if (e.key === 'Enter') replaceOne(); if (e.key === 'Escape') closeFind(); }}
          class="input input-bordered input-sm flex-1 max-w-xs"
        />
        <button class="btn btn-ghost btn-xs" onclick={replaceOne} disabled={matchPositions.length === 0}>Replace</button>
        <button class="btn btn-ghost btn-xs" onclick={replaceAll}>All</button>
      {/if}
    </div>
  {/if}
</div>
