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
        ? { duration: 0.01 }
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

export function hoverLift(node: HTMLElement) {
  let control: MotionCleanup = null;
  const enter = () => {
    if (prefersReducedMotion()) return;
    stop(control);
    control = animate(
      node,
      { transform: "translateY(-1px)" },
      motionSprings.signal,
    );
  };
  const leave = () => {
    stop(control);
    control = animate(
      node,
      { transform: "translateY(0)" },
      { duration: motionDurations.micro, ease: motionEasings.out },
    );
  };
  node.addEventListener("pointerenter", enter);
  node.addEventListener("pointerleave", leave);
  return {
    destroy() {
      stop(control);
      node.removeEventListener("pointerenter", enter);
      node.removeEventListener("pointerleave", leave);
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
      ? { duration: 0.08 }
      : { duration: motionDurations.spatial, ease: motionEasings.out },
  );
  return { destroy: () => control.stop() };
}

export function staggerChildren(
  node: HTMLElement,
  selector = "[data-motion-item]",
) {
  const children = Array.from(node.querySelectorAll<HTMLElement>(selector));
  if (children.length === 0) return {};
  const reduced = prefersReducedMotion();
  const control = animate(
    children,
    reduced
      ? { opacity: [0, 1] }
      : { opacity: [0, 1], transform: ["translateY(6px)", "translateY(0)"] },
    {
      duration: reduced ? 0.08 : motionDurations.response,
      delay: reduced ? 0 : stagger(0.024),
      ease: motionEasings.out,
    },
  );
  return { destroy: () => control.stop() };
}

export function focusTransfer(node: HTMLElement) {
  const focus = () => {
    if (prefersReducedMotion()) return;
    animate(
      node,
      { opacity: [0.72, 1], transform: ["translateY(2px)", "translateY(0)"] },
      { duration: motionDurations.response, ease: motionEasings.out },
    );
  };
  node.addEventListener("focusin", focus);
  return {
    destroy() {
      node.removeEventListener("focusin", focus);
    },
  };
}
