import { describe, expect, it } from "vite-plus/test";

const applicationSources = import.meta.glob("./**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

describe("application architecture boundaries", () => {
  it("does not depend on React, app composition, UI components, or features", () => {
    const violations = Object.entries(applicationSources).flatMap(([path, source]) => {
      if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) return [];
      const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
      const forbidden = imports.filter(
        (specifier) =>
          specifier === "react" ||
          specifier.startsWith("@/app/") ||
          specifier.startsWith("@/components/") ||
          specifier.startsWith("@/features/") ||
          specifier.startsWith("@/infrastructure/"),
      );
      return forbidden.map((specifier) => `${path}: ${specifier}`);
    });

    expect(violations).toEqual([]);
  });
});
