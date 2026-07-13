import { animate } from "motion";
import { motionSprings, prefersReducedMotion } from "./presets";

export function flipLayout(node: HTMLElement, dependency: unknown) {
  let previous = node.getBoundingClientRect();
  let frame = 0;
  let control: { stop: () => void } | null = null;

  function update(_dependency: unknown) {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const next = node.getBoundingClientRect();
      const deltaX = previous.left - next.left;
      const deltaY = previous.top - next.top;
      previous = next;

      if (
        prefersReducedMotion() ||
        (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5)
      ) {
        return;
      }

      control?.stop();
      control = animate(
        node,
        {
          transform: [
            `translate(${deltaX}px, ${deltaY}px)`,
            "translate(0, 0)",
          ],
        },
        motionSprings.surface,
      );
    });
  }

  return {
    update,
    destroy() {
      cancelAnimationFrame(frame);
      control?.stop();
    },
  };
}
