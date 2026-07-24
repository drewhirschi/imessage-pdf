import QRCode from 'qrcode';

interface QRCodeProps {
  value: string;
  /** Rendered pixel size (square). */
  size?: number;
}

/**
 * A QR code rendered as inline SVG, generated synchronously at render time.
 *
 * We deliberately avoid the async `toDataURL` API and emit inline SVG instead:
 * the print route (which is the only place QR codes appear) waits for the DOM
 * to settle and for every <img> to load before handing off to Puppeteer.
 * Inline SVG is present the instant it renders — no image decode to await — so
 * it can never be missed by the print-ready gate. It's also vector-crisp on the
 * page. Used only in the PDF/print output; the web view keeps clickable links.
 */
export default function QRCodeSVG({ value, size = 72 }: QRCodeProps) {
  let matrix: { size: number; data: Uint8Array };
  try {
    matrix = QRCode.create(value, { errorCorrectionLevel: 'M' }).modules;
  } catch {
    return null;
  }

  const count = matrix.size;
  const cell = 1; // unit grid; scaled by viewBox
  const rects: string[] = [];
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (matrix.data[y * count + x]) {
        rects.push(`M${x},${y}h${cell}v${cell}h-${cell}z`);
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${count} ${count}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code for link"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect width={count} height={count} fill="#ffffff" />
      <path d={rects.join('')} fill="#000000" />
    </svg>
  );
}
