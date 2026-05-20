/**
 * Shared helpers for extractors. Single source of truth for converting
 * a string offset into a line/column pair and for skipping comment
 * lines respecting the host language. Extractors must NOT re-implement
 * these helpers locally.
 */

export interface OffsetCoord {
  line: number;
  column: number;
}

export function offsetToLineColumn(content: string, offset: number): OffsetCoord {
  if (offset <= 0) return { line: 1, column: 1 };
  let line = 1;
  let column = 1;
  const limit = Math.min(offset, content.length);
  for (let i = 0; i < limit; i += 1) {
    const ch = content.charCodeAt(i);
    if (ch === 10 /* \n */) {
      line += 1;
      column = 1;
    } else if (ch === 13 /* \r */) {
      // Treat \r\n and lone \r as a single newline boundary.
      if (i + 1 < content.length && content.charCodeAt(i + 1) === 10) {
        // Increment now; next loop iteration will skip the \n part above.
        line += 1;
        column = 1;
        i += 1;
      } else {
        line += 1;
        column = 1;
      }
    } else {
      column += 1;
    }
  }
  return { line, column };
}

export function isCommentLineAt(
  content: string,
  offset: number,
  prefixes: readonly string[],
): boolean {
  // Find the start of the line that contains `offset`.
  let lineStart = offset;
  while (lineStart > 0 && content[lineStart - 1] !== '\n') {
    lineStart -= 1;
  }
  // Strip leading whitespace.
  while (lineStart < content.length) {
    const ch = content[lineStart];
    if (ch !== ' ' && ch !== '\t') break;
    lineStart += 1;
  }
  const head = content.slice(lineStart, lineStart + 4);
  for (const prefix of prefixes) {
    if (head.startsWith(prefix)) return true;
  }
  return false;
}

export function redact(value: string, keepFront = 4, keepBack = 4): string {
  if (value.length <= keepFront + keepBack) return '***';
  return `${value.slice(0, keepFront)}***${value.slice(value.length - keepBack)}`;
}

export interface NonCommentMatch {
  readonly text: string;
  readonly capture: string | undefined;
  readonly index: number;
  readonly line: number;
  readonly column: number;
}

/**
 * Shared iterator for content-wide regex extractors. Resets the regex
 * cursor, runs `matchAll`, and (when the host language scans as code)
 * skips any match that sits inside a line comment. Every extractor that
 * walks a `g`-flagged regex over file content goes through this helper —
 * keeping the loop body and comment-skip logic in exactly one place.
 */
export function* iterateNonCommentMatches(
  content: string,
  regex: RegExp,
  commentPrefixes: readonly string[],
  treatAsCode: boolean,
): Generator<NonCommentMatch> {
  regex.lastIndex = 0;
  for (const match of content.matchAll(regex)) {
    const index = match.index ?? 0;
    if (treatAsCode && isCommentLineAt(content, index, commentPrefixes)) {
      continue;
    }
    const { line, column } = offsetToLineColumn(content, index);
    yield {
      text: match[0],
      capture: match[1],
      index,
      line,
      column,
    };
  }
}
