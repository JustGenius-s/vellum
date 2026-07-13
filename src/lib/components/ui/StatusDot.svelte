<script lang="ts">
  let {
    tone = "neutral",
    pulse = false,
  }: {
    tone?: "primary" | "success" | "warning" | "error" | "neutral";
    pulse?: boolean;
  } = $props();
</script>

<span class="status-dot status-dot--{tone}" class:status-dot--pulse={pulse} aria-hidden="true"></span>

<style>
  .status-dot {
    width: 0.5rem;
    height: 0.5rem;
    flex: none;
    border-radius: var(--vellum-radius-pill);
    background: color-mix(in oklab, var(--color-base-content) 25%, transparent);
  }

  .status-dot--primary {
    background: var(--color-primary);
  }

  .status-dot--success {
    background: var(--color-success);
  }

  .status-dot--warning {
    background: var(--color-warning);
  }

  .status-dot--error {
    background: var(--color-error);
  }

  .status-dot--pulse {
    animation: status-pulse 1.8s var(--vellum-ease-out) infinite;
  }

  @keyframes status-pulse {
    50% {
      opacity: 0.5;
      transform: scale(0.82);
    }
  }
</style>
