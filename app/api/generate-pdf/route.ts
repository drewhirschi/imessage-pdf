import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import type { PaperFormat } from 'puppeteer-core';
import fs from 'fs';

// Route must run on Node (puppeteer-core + child processes).
export const runtime = 'nodejs';
// Don't cache; generation depends on live DB state.
export const dynamic = 'force-dynamic';
// PDFs take a while to render; bump the hard limit.
export const maxDuration = 300;

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
].filter((p): p is string => !!p);

function resolveChromePath(): string {
  for (const p of CHROME_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // fall through
    }
  }
  throw new Error(
    `No Chromium binary found. Tried: ${CHROME_CANDIDATES.join(', ')}. ` +
      'Set PUPPETEER_EXECUTABLE_PATH to override.',
  );
}

interface PDFBody {
  chatId: number | string;
  dbPath: string;
  attachmentsPath: string;
  contactsPath?: string;
  startDate?: number | string | null;
  endDate?: number | string | null;
  // From PDFOptionsDialog
  pageSize?: 'Letter' | 'Legal' | 'A4' | 'Tabloid' | 'Custom';
  customWidthIn?: number;
  customHeightIn?: number;
  marginIn?: number;
  columnWidthPx?: number;
}

function pageDimensions(body: PDFBody): { format?: PaperFormat; width?: string; height?: string } {
  const size = body.pageSize ?? 'Letter';
  if (size === 'Custom') {
    return {
      width: `${body.customWidthIn ?? 8.5}in`,
      height: `${body.customHeightIn ?? 11}in`,
    };
  }
  return { format: size as PaperFormat };
}

export async function POST(request: NextRequest) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const body = (await request.json()) as PDFBody;
    const {
      chatId,
      dbPath,
      attachmentsPath,
      contactsPath,
      startDate,
      endDate,
      marginIn = 0.5,
      columnWidthPx = 430,
    } = body;

    if (!chatId || !dbPath) {
      return NextResponse.json(
        { error: 'chatId and dbPath required' },
        { status: 400 },
      );
    }

    // Build the URL of the print page that Puppeteer will visit. Prefer
    // hitting the same origin the request came in on so the dev server and
    // any port/hostname the user is using just work.
    const originHeader = request.headers.get('origin');
    const hostHeader = request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') ?? 'http';
    // Puppeteer inside the same machine can't reach external hostnames without
    // DNS; prefer 127.0.0.1 so the headless Chrome always resolves.
    const origin = originHeader ?? (hostHeader ? `${proto}://${hostHeader}` : 'http://127.0.0.1:3000');

    const printUrl = new URL(`/conversation/${chatId}/print`, origin);
    printUrl.searchParams.set('dbPath', dbPath);
    printUrl.searchParams.set('attachmentsPath', attachmentsPath);
    if (contactsPath) printUrl.searchParams.set('contactsPath', contactsPath);
    if (startDate != null) printUrl.searchParams.set('startDate', String(startDate));
    if (endDate != null) printUrl.searchParams.set('endDate', String(endDate));
    printUrl.searchParams.set('columnWidth', String(columnWidthPx));

    const executablePath = resolveChromePath();

    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none',
      ],
    });

    const page = await browser.newPage();
    // Slightly wider than the column so scrollbar doesn't pinch things.
    await page.setViewport({ width: Math.max(columnWidthPx + 40, 800), height: 1024, deviceScaleFactor: 2 });

    await page.goto(printUrl.toString(), {
      waitUntil: 'networkidle0',
      timeout: 120_000,
    });

    // Print page sets data-print-ready="1" once messages are mounted.
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-print-ready') === '1',
      { timeout: 120_000 },
    );

    // Media in the message list is behind an IntersectionObserver
    // (ImageAttachment / VideoAttachment lazy-load with a 500px rootMargin).
    // Puppeteer's viewport is only ~1024px tall, so without scrolling the
    // whole document none of the images below the first page would ever
    // mount. Scroll through in chunks so every observer fires, then wait
    // for every <img> to finish loading before printing.
    await page.evaluate(async () => {
      const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
      let y = 0;
      while (y < document.documentElement.scrollHeight) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
        y += step;
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => setTimeout(r, 250));
      window.scrollTo(0, 0);
    });

    await page.waitForFunction(
      () => {
        const imgs = Array.from(document.querySelectorAll('img'));
        if (imgs.length === 0) return true;
        return imgs.every(
          (img) =>
            img.complete && (img.naturalWidth > 0 || img.dataset.allowBroken === '1'),
        );
      },
      { timeout: 180_000, polling: 500 },
    );

    const dims = pageDimensions(body);
    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: false,
      margin: {
        top: `${marginIn}in`,
        right: `${marginIn}in`,
        bottom: `${marginIn}in`,
        left: `${marginIn}in`,
      },
      ...dims,
    });

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="imessage-${chatId}-${Date.now()}.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: String(error) },
      { status: 500 },
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
