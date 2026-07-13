import { animate, stagger } from "motion";
import {
  motionDurations,
  motionEasings,
  motionSprings,
  prefersReducedMotion,
} from "./presets";

type MotionCleanup = { stop: () => void } | null;

function stop(control: MotionCleanup) {
  control?.stop();
}

export function press(node: HTMLElement) {
  let control: MotionCleanup = null;

  const down = () => {
    if (prefersReducedMotion()) return;
    stop(control);
    control = animate(
      node,
      { transform: "translateY(1px) scale(0.975)" },
      motionSprings.signal,
    );
  };

  const up = () => {
    stop(control);
    control = animate(
      node,
      { transform: "translateY(0) scale(1)" },
      prefersReducedMotion()
        ? { duration: motionDurations.instant }
        : motionSprings.signal,
    );
  };

  node.addEventListener("pointerdown", down);
  node.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", up);
  node.addEventListener("pointerleave", up);

  return {
    destroy() {
      stop(control);
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
      node.removeEventListener("pointerleave", up);
    },
  };
}

export function surfaceEnter(
  node: HTMLElement,
  options: { x?: number; y?: number; scale?: number } = {},
) {
  const reduced = prefersReducedMotion();
  const control = animate(
    node,
    reduced
      ? { opacity: [0, 1] }
      : {
          opacity: [0, 1],
          transform: [
            `translate(${options.x ?? 0}px, ${options.y ?? 10}px) scale(${options.scale ?? 0.985})`,
            "translate(0, 0) scale(1)",
          ],
        },
    reduced
      ? { duration: motionDurations.reduced }
      : { duration: motionDurations.spatial, ease: motionEasings.out },
  );
  return { destroy: () => control.stop() };
}

export function staggerChildren(
  node: HTMLElement,
  config:
    | string
    | { selector?: string; dependency?: unknown; limit?: number } = {},
) {
  let control: MotionCleanup = null;

  function run(nextConfig: typeof config) {
    const options =
      typeof nextConfig === "string"
        ? { selector: nextConfig }
        : nextConfig;
    const selector = options.selector ?? "[data-motion-item]";
    const limit = options.limit ?? 30;
    const children = Array.from(
      node.querySelectorAll<HTMLElement>(selector),
    ).slice(0, limit);
    if (children.length === 0) return;
    const reduced = prefersReducedMotion();
    stop(control);
    control = animate(
      children,
      reduced
        ? { opacity: [0, 1] }
        : { opacity: [0, 1], transform: ["translateY(6px)", "translateY(0)"] },
      {
        duration: reduced ? motionDurations.reduced : motionDurations.response,
        delay: reduced ? 0 : stagger(0.024),
        ease: motionEasings.out,
      },
    );
  }

  run(config);
  return {
    update(nextConfig: typeof config) {
      requestAnimationFrame(() => run(nextConfig));
    },
    destroy() {
      stop(control);
    },
  };
}

export function crossfadeEnter(
  node: HTMLElement,
  options: { x?: number; y?: number } = {},
) {
  const reduced = prefersReducedMotion();
  const control = animate(
    node,
    reduced
      ? { opacity: [0, 1] }
      : {
          opacity: [0, 1],
          transform: [
            `translate(${options.x ?? 0}px, ${options.y ?? 4}px)`,
            "translate(0, 0)",
          ],
        },
    {
      duration: reduced ? motionDurations.reduced : motionDurations.response,
      ease: motionEasings.out,
    },
  );
  return { destroy: () => control.stop() };
}

export function crossfadeExit(node: HTMLElement) {
  const reduced = prefersReducedMotion();
  const control = animate(
    node,
    { opacity: [1, 0] },
    {
      duration: reduced ? motionDurations.reduced : motionDurations.response,
      ease: motionEasings.exit,
    },
  );
  return { destroy: () => control.stop() };
}

export function expandEnter(node: HTMLElement) {
  const targetHeight = node.scrollHeight;
  node.style.overflow = "hidden";
  const control = animate(
    node,
    prefersReducedMotion()
      ? { opacity: [0, 1] }
      : { height: [0, targetHeight], opacity: [0, 1] },
    {
      duration: prefersReducedMotion()
        ? motionDurations.reduced
        : motionDurations.spatial,
      ease: motionEasings.out,
    },
  );
  void control.then(() => {
    node.style.height = "auto";
    node.style.overflow = "";
  });
  return { destroy: () => control.stop() };
}

export async function animateExit(
  node: HTMLElement,
  options: { x?: number; y?: number } = {},
): Promise<void> {
  const reduced = prefersReducedMotion();
  const control = animate(
    node,
    reduced
      ? { opacity: [1, 0] }
      : {
          opacity: 0,
          transform: `translate(${options.x ?? 0}px, ${options.y ?? 4}px)`,
        },
    {
      duration: reduced ? motionDurations.reduced : motionDurations.micro,
      ease: motionEasings.exit,
    },
  );
  await control;
}
