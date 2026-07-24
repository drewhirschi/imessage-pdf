import { describe, it, expect } from 'vitest';
import { parsePort, getFreePort, resolveServerPort } from '../../electron/lib/port.js';

describe('parsePort', () => {
  it('returns a valid integer port', () => {
    expect(parsePort('3000')).toBe(3000);
    expect(parsePort(8080)).toBe(8080);
    expect(parsePort('0')).toBe(0); // 0 = OS-assigned, valid
  });

  it('returns the fallback for invalid input', () => {
    expect(parsePort('', 1234)).toBe(1234);
    expect(parsePort(null, 1234)).toBe(1234);
    expect(parsePort('abc', 1234)).toBe(1234);
    expect(parsePort('99999', 1234)).toBe(1234); // out of range
    expect(parsePort('-1', 1234)).toBe(1234);
    expect(parsePort('80.5', 1234)).toBe(1234); // non-integer
  });

  it('defaults the fallback to null', () => {
    expect(parsePort('nope')).toBeNull();
  });
});

describe('getFreePort', () => {
  it('returns a bindable port number', async () => {
    const port = await getFreePort();
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);
  });
});

describe('resolveServerPort', () => {
  it('honors an explicit valid IMESSAGE_PDF_PORT', async () => {
    expect(await resolveServerPort({ IMESSAGE_PDF_PORT: '4321' })).toBe(4321);
  });

  it('ignores a generic PORT env (only IMESSAGE_PDF_PORT is honored)', async () => {
    // A stray exported PORT matching a running dev server would make the
    // window drive the wrong server instance; review L1.
    const port = await resolveServerPort({ PORT: '5555' });
    expect(port).not.toBe(5555);
    expect(port).toBeGreaterThan(0);
  });

  it('picks a free port when no valid env is set', async () => {
    const port = await resolveServerPort({ PORT: 'garbage' });
    expect(port).toBeGreaterThan(0);
  });
});
