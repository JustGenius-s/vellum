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
  class="toggle-control"
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
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-base-content) 14%, transparent);
    transition: background-color var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .toggle-control span {
    position: absolute;
    top: 0.2rem;
    left: 0.2rem;
    width: 1rem;
    height: 1rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-base-content) 72%, transparent);
    transform: translateX(0);
    transition:
      transform var(--vellum-motion-normal) var(--vellum-ease-out),
      background-color var(--vellum-motion-fast) var(--vellum-ease-out);
  }

  .toggle-control.is-checked {
    background: color-mix(in oklab, var(--color-primary) 78%, transparent);
  }

  .toggle-control.is-checked span {
    background: var(--color-primary-content);
    transform: translateX(1.1rem);
  }
</style>
