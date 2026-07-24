// Pure, dependency-free mapping from the web app's PDFOptions (as sent to
// /api/generate-pdf) to Electron `webContents.printToPDF()` options. Kept free
// of any Electron import so it is unit-testable under vitest/Node.
//
// Electron printToPDF semantics (v30+):
//   - pageSize: a named string ('Letter' | 'Legal' | 'A4' | 'Tabloid' | ...)
//     OR a { width, height } object measured in MICRONS.
//   - margins:  { marginType, top, bottom, left, right } with the edge values
//     measured in INCHES.
// See https://www.electronjs.org/docs/latest/api/web-contents#contentsprinttopdfoptions

const MICRONS_PER_INCH = 25400;

// Named sizes Electron understands directly. 'Custom' is handled via microns.
const NAMED_SIZES = new Set(['Letter', 'Legal', 'A4', 'Tabloid']);

function inchesToMicrons(inches) {
  return Math.round(inches * MICRONS_PER_INCH);
}

/**
 * @param {object} body The parsed /api/generate-pdf request body.
 * @param {'Letter'|'Legal'|'A4'|'Tabloid'|'Custom'} [body.pageSize]
 * @param {number} [body.customWidthIn]
 * @param {number} [body.customHeightIn]
 * @param {number} [body.marginIn]
 * @returns {{ printBackground: boolean, pageSize: (string|{width:number,height:number}), margins: {marginType:string, top:number, bottom:number, left:number, right:number} }}
 */
function mapPrintOptions(body = {}) {
  const size = body.pageSize ?? 'Letter';
  const marginIn = typeof body.marginIn === 'number' ? body.marginIn : 0.5;

  let pageSize;
  if (size === 'Custom') {
    const w = typeof body.customWidthIn === 'number' && body.customWidthIn > 0 ? body.customWidthIn : 8.5;
    const h = typeof body.customHeightIn === 'number' && body.customHeightIn > 0 ? body.customHeightIn : 11;
    pageSize = { width: inchesToMicrons(w), height: inchesToMicrons(h) };
  } else if (NAMED_SIZES.has(size)) {
    pageSize = size;
  } else {
    // Unknown value — fall back to Letter rather than throw.
    pageSize = 'Letter';
  }

  return {
    printBackground: true,
    pageSize,
    margins: {
      marginType: 'custom',
      top: marginIn,
      bottom: marginIn,
      left: marginIn,
      right: marginIn,
    },
  };
}

/**
 * Build the /conversation/:id/print URL (path + query) the hidden window loads.
 * Pure string assembly so it can be unit-tested without a running server.
 * Mirrors the query params the puppeteer route sets in generate-pdf/route.ts.
 *
 * @param {string} origin e.g. "http://127.0.0.1:53421"
 * @param {object} body request body
 * @returns {string} absolute URL
 */
function buildPrintUrl(origin, body = {}) {
  const chatId = body.chatId;
  const url = new URL(`/conversation/${chatId}/print`, origin);
  if (body.dbPath) url.searchParams.set('dbPath', body.dbPath);
  if (body.attachmentsPath) url.searchParams.set('attachmentsPath', body.attachmentsPath);
  if (body.contactsPath) url.searchParams.set('contactsPath', body.contactsPath);
  if (body.startDate != null) url.searchParams.set('startDate', String(body.startDate));
  if (body.endDate != null) url.searchParams.set('endDate', String(body.endDate));
  const columnWidth = body.columnWidthPx != null ? body.columnWidthPx : 430;
  url.searchParams.set('columnWidth', String(columnWidth));
  return url.toString();
}

/**
 * Suggested filename for the native save dialog. Pure so it is testable.
 * @param {string|number} chatId
 * @param {number} [now] epoch ms (defaults to Date.now())
 */
function suggestedPdfFilename(chatId, now) {
  const stamp = now == null ? Date.now() : now;
  return `imessage-conversation-${chatId}-${stamp}.pdf`;
}

module.exports = {
  MICRONS_PER_INCH,
  inchesToMicrons,
  mapPrintOptions,
  buildPrintUrl,
  suggestedPdfFilename,
};
