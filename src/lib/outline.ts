export interface OutlineHeading {
  level: number;
  title: string;
  line: number;
  from: number;
}

/** Parse Typst heading markers (`=`, `==`, …) from source text. */
export function parseOutline(source: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  let offset = 0;
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = /^(=+)\s+(.+?)\s*$/.exec(line);
    if (match) {
      const level = match[1].length;
      if (level >= 1 && level <= 6) {
        const title = match[2]
          .replace(/<[^>]*>\s*$/, "")
          .replace(/#label\([^)]*\)\s*$/, "")
          .trim();
        if (title) {
          headings.push({
            level,
            title,
            line: i + 1,
            from: offset + match[0].indexOf(match[2]),
          });
        }
      }
    }
    offset += line.length + 1;
  }

  return headings;
}
