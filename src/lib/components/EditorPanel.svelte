<script lang="ts">
  import CodeMirror from "$lib/components/CodeMirror.svelte";
  import { getVault } from "$lib/stores.svelte";

  const vault = getVault();
</script>

<div class="h-full overflow-hidden">
  <CodeMirror
    source={vault.source}
    activePath={vault.activeTabPath}
    diagnostics={vault.diagnostics}
    fileNames={vault.fileNames}
    onchange={(value) => vault.onSourceChange(value)}
  />
</div>
