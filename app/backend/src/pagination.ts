import { AppError } from './errors';

export type CursorScope = 'organizations' | 'admin-organizations' | 'admin-officers' | 'announcements' | 'announcement-comments' | 'date-entries';

interface CursorPayload {
  v: 1;
  scope: CursorScope;
  context: string;
  boundary: string[];
}

export function encodeCursor(scope: CursorScope, context: string, boundary: string[]): string {
  const payload: CursorPayload = { v: 1, scope, context, boundary };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(token: string | undefined, scope: CursorScope, context: string, boundaryLength: number): string[] | undefined {
  if (token === undefined) return undefined;
  if (token.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new AppError('invalid_page_token', 'The page token is invalid.', 400);
  }
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8');
    if (Buffer.from(json, 'utf8').toString('base64url') !== token) throw new Error('non-canonical token');
    const value = JSON.parse(json) as Partial<CursorPayload>;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'boundary,context,scope,v'
      || value.v !== 1 || value.scope !== scope || value.context !== context
      || !Array.isArray(value.boundary) || value.boundary.length !== boundaryLength
      || value.boundary.some((part) => typeof part !== 'string' || part.length > 512)
      || typeof value.boundary.at(-1) !== 'string' || value.boundary.at(-1)?.length === 0 || value.boundary.at(-1)?.includes('/')) {
      throw new Error('invalid token payload');
    }
    return value.boundary;
  } catch {
    throw new AppError('invalid_page_token', 'The page token is invalid for this query.', 400);
  }
}
