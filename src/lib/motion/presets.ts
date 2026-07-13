export const motionDurations = {
  micro: 0.12,
  response: 0.2,
  spatial: 0.34,
  canvas: 0.42,
} as const;

export const motionEasings = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
  exit: [0.4, 0, 1, 1],
} as const;

export const motionSprings = {
  signal: { type: "spring", stiffness: 560, damping: 38, mass: 0.45 },
  surface: { type: "spring", stiffness: 360, damping: 34, mass: 0.75 },
  canvas: { type: "spring", stiffness: 220, damping: 32, mass: 1.1 },
} as const;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
