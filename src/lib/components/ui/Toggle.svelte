<script lang="ts">
  import { press } from "$lib/motion/actions";

  let {
    checked = false,
    label,
    onchange,
  }: {
    checked?: boolean;
    label: string;
    onchange?: (checked: boolean) => void;
  } = $props();
</script>

<button
  use:press
  type="button"
  class="toggle-control ui-glass-control"
  class:is-checked={checked}
  role="switch"
  aria-checked={checked}
  aria-label={label}
  onclick={() => onchange?.(!checked)}
>
  <span></span>
</button>

<style>
  .toggle-control {
    position: relative;
    width: 2.5rem;
    height: 1.4rem;
    flex: none;
    border: 0;
    border-radius: var(--vellum-radius-pill);
    transition:
      background-color var(--vellum-motion-fast) var(--vellum-ease-out),
      box-shadow var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .toggle-control span {
    position: absolute;
    top: 0.2rem;
    left: 0.2rem;
    width: 1rem;
    height: 1rem;
    border-radius: var(--vellum-radius-pill);
    background: color-mix(in oklab, var(--color-base-content) 72%, transparent);
    transform: translateX(0);
    transition:
      transform var(--vellum-motion-normal) var(--vellum-ease-out),
      background-color var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .toggle-control.is-checked {
    background:
      linear-gradient(180deg, color-mix(in oklab, white 14%, transparent), transparent 48%),
      color-mix(in oklab, var(--color-primary) 80%, transparent);
    box-shadow:
      inset 0 1px 0 color-mix(in oklab, white 28%, transparent),
      inset 0 0 0 1px color-mix(in oklab, var(--color-primary) 42%, transparent);
  }

  .toggle-control.is-checked span {
    background: var(--color-primary-content);
    transform: translateX(1.1rem);
  }
</style>
