<script lang="ts">
  let { size = "md", label = "Loading" }: { size?: "sm" | "md"; label?: string } =
    $props();
</script>

<span class="spinner spinner--{size}" role="status" aria-label={label}></span>

<style>
  .spinner {
    display: inline-block;
    border: 1.5px solid color-mix(in oklab, var(--color-primary) 24%, transparent);
    border-top-color: var(--color-primary);
    border-radius: var(--vellum-radius-pill);
    animation: spin 0.72s linear infinite;
  }

  .spinner--sm {
    width: 0.875rem;
    height: 0.875rem;
  }

  .spinner--md {
    width: 1.25rem;
    height: 1.25rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
