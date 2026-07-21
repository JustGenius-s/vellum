import type { CompileDiagnostic } from "@/domain/workspace";

export function formatDiagnosticForClipboard(diagnostic: CompileDiagnostic) {
  const lines = [`${diagnostic.severity}: ${diagnostic.message}`];

  if (diagnostic.path) {
    const location = diagnostic.line
      ? `${diagnostic.path}:${diagnostic.line}:${diagnostic.column ?? 1}`
      : diagnostic.path;
    lines.push(`at ${location}`);
  } else if (diagnostic.line) {
    lines.push(`at line ${diagnostic.line}:${diagnostic.column ?? 1}`);
  }

  lines.push(...diagnostic.hints.map((hint) => `hint: ${hint}`));
  return lines.join("\n");
}
