export interface ByteRange {
  start: number;
  end: number;
}

export type ParseRangeResult =
  | { type: 'valid'; range: ByteRange; contentLength: number; contentRange: string }
  | { type: 'invalid' }
  | { type: 'unsatisfiable'; totalLength: number };

/**
 * Parse an HTTP Range header (e.g. "bytes=0-1023", "bytes=1024-", "bytes=-500")
 * according to RFC 7233.
 */
export function parseByteRange(rangeHeader: string | undefined, totalLength: number): ParseRangeResult {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return { type: 'invalid' };
  }

  const rangeSpec = rangeHeader.slice(6).trim();
  // We only support single range requests for video streaming (standard practice)
  if (rangeSpec.includes(',')) {
    return { type: 'invalid' };
  }

  const parts = rangeSpec.split('-');
  if (parts.length !== 2) {
    return { type: 'invalid' };
  }

  const [rawStart, rawEnd] = parts;
  let start: number;
  let end: number;

  if (rawStart === '' && rawEnd !== '') {
    // Suffix byte range: e.g. bytes=-500 (last 500 bytes)
    const suffixLength = parseInt(rawEnd, 10);
    if (isNaN(suffixLength) || suffixLength <= 0) {
      return { type: 'invalid' };
    }
    start = Math.max(0, totalLength - suffixLength);
    end = totalLength - 1;
  } else if (rawStart !== '' && rawEnd === '') {
    // Open-ended range: e.g. bytes=1000-
    start = parseInt(rawStart, 10);
    if (isNaN(start) || start < 0) {
      return { type: 'invalid' };
    }
    end = totalLength - 1;
  } else if (rawStart !== '' && rawEnd !== '') {
    // Closed range: e.g. bytes=0-1023
    start = parseInt(rawStart, 10);
    end = parseInt(rawEnd, 10);
    if (isNaN(start) || isNaN(end) || start < 0 || end < start) {
      return { type: 'invalid' };
    }
  } else {
    return { type: 'invalid' };
  }

  // Bounds checks against total file size
  if (totalLength <= 0 || start >= totalLength) {
    return { type: 'unsatisfiable', totalLength };
  }

  // If client requested past end of file, clamp to last byte
  end = Math.min(end, totalLength - 1);

  const contentLength = end - start + 1;
  const contentRange = `bytes ${start}-${end}/${totalLength}`;

  return {
    type: 'valid',
    range: { start, end },
    contentLength,
    contentRange,
  };
}
