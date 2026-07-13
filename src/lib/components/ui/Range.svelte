<script lang="ts">
  let {
    value,
    min,
    max,
    step = 1,
    label,
    oninput,
  }: {
    value: number;
    min: number;
    max: number;
    step?: number;
    label: string;
    oninput?: (value: number) => void;
  } = $props();

  let progress = $derived(((value - min) / (max - min)) * 100);
</script>

<input
  type="range"
  {min}
  {max}
  {step}
  {value}
  aria-label={label}
  style={`--range-progress: ${progress}%`}
  oninput={(event) => oninput?.(Number(event.currentTarget.value))}
/>

<style>
  input {
    width: 100%;
    height: 1.25rem;
    appearance: none;
    cursor: pointer;
    background: transparent;
  }

  input::-webkit-slider-runnable-track {
    height: 0.25rem;
    border-radius: var(--vellum-radius-pill);
    background: linear-gradient(
      to right,
      var(--color-primary) var(--range-progress),
      color-mix(in oklab, var(--color-base-content) 10%, transparent)
        var(--range-progress)
    );
  }

  input::-webkit-slider-thumb {
    width: 0.9rem;
    height: 0.9rem;
    margin-top: -0.325rem;
    appearance: none;
    border: 0.2rem solid var(--vellum-surface-canvas);
    border-radius: var(--vellum-radius-pill);
    background: var(--color-primary);
    box-shadow: 0 0 0 1px color-mix(in oklab, var(--color-primary) 55%, transparent);
  }

  input::-moz-range-track {
    height: 0.25rem;
    border-radius: var(--vellum-radius-pill);
    background: color-mix(in oklab, var(--color-base-content) 10%, transparent);
  }

  input::-moz-range-progress {
    height: 0.25rem;
    border-radius: var(--vellum-radius-pill);
    background: var(--color-primary);
  }

  input::-moz-range-thumb {
    width: 0.7rem;
    height: 0.7rem;
    border: 0.2rem solid var(--vellum-surface-canvas);
    border-radius: var(--vellum-radius-pill);
    background: var(--color-primary);
  }
</style>
