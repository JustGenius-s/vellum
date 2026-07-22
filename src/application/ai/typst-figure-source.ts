export function extractTypstSource(response: string) {
  const trimmed = response.trim();
  const fenced = /```(?:typst)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1]?.trim();
  const source = fenced || trimmed.replace(/^typst\s*\n/i, "").trim();
  if (!source) throw new Error("The AI returned empty Typst source");
  if (source.length > 120_000) {
    throw new Error("The generated Typst source is unexpectedly large");
  }
  return source.endsWith("\n") ? source : `${source}\n`;
}

export function validateTypstChartSource(source: string) {
  if (!/json\s*\(\s*"projection\.json"\s*\)/.test(source)) {
    throw new Error('The generated chart must read json("projection.json")');
  }
  if (/#set\s+page\b/.test(source)) {
    throw new Error("The generated chart must not set page-wide properties");
  }
}
