import { describe, it, expect } from 'vitest';
// The Electron helpers are plain CommonJS so they can be required by the
// (CommonJS) Electron main process; vitest imports them via cjs interop.
import {
  MICRONS_PER_INCH,
  inchesToMicrons,
  mapPrintOptions,
  buildPrintUrl,
  suggestedPdfFilename,
} from '../../electron/lib/printOptions.js';

describe('inchesToMicrons', () => {
  it('converts inches to microns (1in = 25400µm)', () => {
    expect(MICRONS_PER_INCH).toBe(25400);
    expect(inchesToMicrons(1)).toBe(25400);
    expect(inchesToMicrons(8.5)).toBe(215900);
    expect(inchesToMicrons(11)).toBe(279400);
  });
});

describe('mapPrintOptions', () => {
  it('maps a named page size straight through', () => {
    const out = mapPrintOptions({ pageSize: 'A4', marginIn: 0.5 });
    expect(out.pageSize).toBe('A4');
    expect(out.printBackground).toBe(true);
    expect(out.margins).toEqual({
      marginType: 'custom',
      top: 0.5,
      bottom: 0.5,
      left: 0.5,
      right: 0.5,
    });
  });

  it('defaults to Letter with 0.5in margins when nothing is given', () => {
    const out = mapPrintOptions({});
    expect(out.pageSize).toBe('Letter');
    expect(out.margins.top).toBe(0.5);
  });

  it('converts a Custom size to a microns object', () => {
    const out = mapPrintOptions({
      pageSize: 'Custom',
      customWidthIn: 5,
      customHeightIn: 7,
      marginIn: 0.25,
    });
    expect(out.pageSize).toEqual({ width: 127000, height: 177800 });
    expect(out.margins.left).toBe(0.25);
  });

  it('falls back to sane Custom defaults on invalid dimensions', () => {
    const out = mapPrintOptions({ pageSize: 'Custom', customWidthIn: 0, customHeightIn: -3 });
    expect(out.pageSize).toEqual({ width: inchesToMicrons(8.5), height: inchesToMicrons(11) });
  });

  it('falls back to Letter for an unknown page size', () => {
    const out = mapPrintOptions({ pageSize: 'Poster' as never });
    expect(out.pageSize).toBe('Letter');
  });
});

describe('buildPrintUrl', () => {
  it('assembles the print route with all query params', () => {
    const url = buildPrintUrl('http://127.0.0.1:5000', {
      chatId: 42,
      dbPath: '/db/chat.db',
      attachmentsPath: '/att',
      contactsPath: '/c.json',
      startDate: 100,
      endDate: 200,
      columnWidthPx: 390,
    });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/conversation/42/print');
    expect(parsed.searchParams.get('dbPath')).toBe('/db/chat.db');
    expect(parsed.searchParams.get('attachmentsPath')).toBe('/att');
    expect(parsed.searchParams.get('contactsPath')).toBe('/c.json');
    expect(parsed.searchParams.get('startDate')).toBe('100');
    expect(parsed.searchParams.get('endDate')).toBe('200');
    expect(parsed.searchParams.get('columnWidth')).toBe('390');
  });

  it('omits optional params and defaults columnWidth to 430', () => {
    const url = buildPrintUrl('http://127.0.0.1:5000', { chatId: 7, dbPath: '/db' });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('columnWidth')).toBe('430');
    expect(parsed.searchParams.has('startDate')).toBe(false);
    expect(parsed.searchParams.has('contactsPath')).toBe(false);
  });
});

describe('suggestedPdfFilename', () => {
  it('builds a deterministic filename with a supplied timestamp', () => {
    expect(suggestedPdfFilename(9, 1234)).toBe('imessage-conversation-9-1234.pdf');
  });
});
