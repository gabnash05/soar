import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './pagination';

describe('stable pagination cursors', () => {
  it('round-trips query-scoped ordered boundaries using a versioned token', () => {
    const token = encodeCursor('organizations', 'robotics', ['Robotics Club', 'robotics-club']);

    expect(decodeCursor(token, 'organizations', 'robotics', 2)).toEqual(['Robotics Club', 'robotics-club']);
  });

  it('rejects numeric offsets, malformed data, wrong scope/context, and malformed boundaries', () => {
    const valid = encodeCursor('announcements', 'robotics', ['1792080000000', 'post-one']);
    const wrongShape = Buffer.from(JSON.stringify({ v: 1, scope: 'announcements', context: 'robotics', boundary: ['1', 'post-one'], extra: true })).toString('base64url');

    for (const token of ['1', '!', wrongShape]) {
      expect(() => decodeCursor(token, 'announcements', 'robotics', 2)).toThrow();
    }
    expect(() => decodeCursor(valid, 'organizations', 'robotics', 2)).toThrow();
    expect(() => decodeCursor(valid, 'announcements', 'other-org', 2)).toThrow();
    expect(() => decodeCursor(encodeCursor('announcements', 'robotics', ['timestamp', '']), 'announcements', 'robotics', 2)).toThrow();
  });
});
