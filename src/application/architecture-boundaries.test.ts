import { describe, expect, it } from "vite-plus/test";

const applicationSources = import.meta.glob("./**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const pluginManifestSources = import.meta.glob("../app/plugins/*-plugins.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const scopedPluginFeatureSources = import.meta.glob(
  [
    "../features/settings/settings-page.tsx",
    "../features/workspace/sidebar/files-panel.tsx",
    "../features/workspace/sidebar/entry-dialog.tsx",
  ],
  {
    eager: true,
    import: "default",
    query: "?raw",
  },
) as Record<string, string>;

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

  it("keeps plugin manifests behind scoped capabilities", () => {
    const violations = Object.entries(pluginManifestSources).flatMap(([path, source]) => {
      const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
      return imports
        .filter(
          (specifier) =>
            specifier === "@/application/workspace-controller" ||
            specifier === "@/app/workspace-context",
        )
        .map((specifier) => `${path}: ${specifier}`);
    });

    expect(violations).toEqual([]);
  });

  it("keeps migrated plugin features off the legacy workspace context", () => {
    const violations = Object.entries(scopedPluginFeatureSources).flatMap(([path, source]) =>
      source.includes("@/app/workspace-context") ? [path] : [],
    );

    expect(violations).toEqual([]);
  });
});
