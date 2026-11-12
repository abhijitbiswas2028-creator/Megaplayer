export interface ParsedMegaLink {
  isValid: boolean;
  type: 'file' | 'folder' | 'invalid';
  id?: string;
  key?: string;
  hasKey: boolean;
  sanitizedUrl?: string;
  errorMessage?: string;
}

/**
 * Validates and extracts file identifier and decryption key from MEGA share links.
 * Handles formats:
 * - https://mega.nz/file/{fileId}#{key}
 * - https://mega.nz/#!{fileId}!{key} (legacy)
 * - https://mega.io/file/{fileId}#{key}
 */
export function parseMegaUrl(rawUrl: string): ParsedMegaLink {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return {
      isValid: false,
      type: 'invalid',
      hasKey: false,
      errorMessage: 'MEGA URL is required and must be a string.',
    };
  }

  const trimmed = rawUrl.trim();

  // Pattern 1: https://mega.nz/file/<id>#<key> or mega.io
  const modernFileMatch = trimmed.match(/^https?:\/\/(?:mega\.nz|mega\.io)\/file\/([a-zA-Z0-9_-]+)(?:#([a-zA-Z0-9_-]+))?$/i);
  if (modernFileMatch) {
    const id = modernFileMatch[1];
    const key = modernFileMatch[2];
    const hasKey = Boolean(key && key.length > 5);

    return {
      isValid: hasKey,
      type: 'file',
      id,
      key,
      hasKey,
      sanitizedUrl: `https://mega.nz/file/${id}`,
      errorMessage: hasKey ? undefined : 'Decryption key is missing in the MEGA link (hash fragment missing).',
    };
  }

  // Pattern 2: Legacy https://mega.nz/#!<id>!<key>
  const legacyMatch = trimmed.match(/^https?:\/\/(?:mega\.nz|mega\.io)\/#!([a-zA-Z0-9_-]+)(?:!([a-zA-Z0-9_-]+))?$/i);
  if (legacyMatch) {
    const id = legacyMatch[1];
    const key = legacyMatch[2];
    const hasKey = Boolean(key && key.length > 5);

    return {
      isValid: hasKey,
      type: 'file',
      id,
      key,
      hasKey,
      sanitizedUrl: `https://mega.nz/file/${id}`,
      errorMessage: hasKey ? undefined : 'Decryption key is missing in legacy MEGA link.',
    };
  }

  // Pattern 3: Folder link: https://mega.nz/folder/<id>#<key>
  const folderMatch = trimmed.match(/^https?:\/\/(?:mega\.nz|mega\.io)\/folder\/([a-zA-Z0-9_-]+)/i);
  if (folderMatch) {
    return {
      isValid: false,
      type: 'folder',
      hasKey: false,
      errorMessage: 'MEGA folder links are not supported for single video streaming. Please provide a direct file share link.',
    };
  }

  return {
    isValid: false,
    type: 'invalid',
    hasKey: false,
    errorMessage: 'Invalid MEGA URL format. Must be https://mega.nz/file/<id>#<key> or https://mega.nz/#!<id>!<key>',
  };
}
