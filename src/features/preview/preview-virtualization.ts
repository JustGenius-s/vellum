export function previewVirtualRange(
  visible: Iterable<number>,
  pageCount: number,
  overscan = 2,
) {
  if (pageCount <= 0) return { from: 0, to: -1 };
  const indexes = [...visible].filter((index) => index >= 0 && index < pageCount);
  if (!indexes.length) indexes.push(0);
  return {
    from: Math.max(0, Math.min(...indexes) - overscan),
    to: Math.min(pageCount - 1, Math.max(...indexes) + overscan),
  };
}
