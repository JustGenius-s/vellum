<script lang="ts">
  import CodeMirror from "$lib/components/CodeMirror.svelte";

  let {
    source = "",
    fileNames = [],
    onSourceChange = () => {},
  }: {
    source: string;
    fileNames: string[];
    onSourceChange: (v: string) => void;
  } = $props();
</script>

<div class="flex flex-col h-full overflow-hidden">
  <div class="flex-1 overflow-hidden">
    <CodeMirror {source} {fileNames} onchange={onSourceChange} />
  </div>
</div>
