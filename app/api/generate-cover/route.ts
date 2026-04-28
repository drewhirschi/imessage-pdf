import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import {
  CoverMessage,
  CoverSpec,
  deleteCoverSpec,
  putCoverSpec,
} from '@/lib/cover/spec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
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

function parseMessages(raw: unknown): CoverMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: CoverMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const text = typeof (m as { text?: unknown }).text === 'string'
      ? (m as { text: string }).text
      : '';
    const isFromMe = !!(m as { isFromMe?: unknown }).isFromMe;
    if (!text) continue;
    out.push({ text, isFromMe });
  }
  return out;
}

async function fileToDataUrl(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export async function POST(request: NextRequest) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  let token: string | null = null;
  try {
    const form = await request.formData();
    const specRaw = form.get('spec');
    if (typeof specRaw !== 'string') {
      return NextResponse.json({ error: 'spec field required' }, { status: 400 });
    }
    const parsed = JSON.parse(specRaw) as Partial<CoverSpec> & {
      messages?: unknown;
    };

    const backFile = form.get('backImage');
    const backImageDataUrl =
      backFile instanceof File && backFile.size > 0
        ? await fileToDataUrl(backFile)
        : null;

    const trimWidthIn = Number(parsed.trimWidthIn);
    const trimHeightIn = Number(parsed.trimHeightIn);
    const spineWidthIn = Number(parsed.spineWidthIn);
    const bleedIn = Number.isFinite(Number(parsed.bleedIn))
      ? Number(parsed.bleedIn)
      : 0.125;
    if (!Number.isFinite(trimWidthIn) || trimWidthIn <= 0) {
      return NextResponse.json(
        { error: 'trimWidthIn must be a positive number' },
        { status: 400 },
      );
    }
    if (!Number.isFinite(trimHeightIn) || trimHeightIn <= 0) {
      return NextResponse.json(
        { error: 'trimHeightIn must be a positive number' },
        { status: 400 },
      );
    }
    if (!Number.isFinite(spineWidthIn) || spineWidthIn < 0) {
      return NextResponse.json(
        { error: 'spineWidthIn must be a non-negative number' },
        { status: 400 },
      );
    }

    const spec: CoverSpec = {
      dateLabel: typeof parsed.dateLabel === 'string' ? parsed.dateLabel : '',
      messages: parseMessages(parsed.messages),
      showTypingIndicator: !!parsed.showTypingIndicator,
      trimWidthIn,
      trimHeightIn,
      spineWidthIn,
      bleedIn,
      spineColor: typeof parsed.spineColor === 'string' ? parsed.spineColor : '#ffffff',
      spineText: typeof parsed.spineText === 'string' ? parsed.spineText : '',
      spineTextColor:
        typeof parsed.spineTextColor === 'string' ? parsed.spineTextColor : '#000000',
      marginIn: Number.isFinite(Number(parsed.marginIn))
        ? Number(parsed.marginIn)
        : 0.5,
      columnWidthPx: Number.isFinite(Number(parsed.columnWidthPx))
        ? Number(parsed.columnWidthPx)
        : 430,
      bubbleScale: Number.isFinite(Number(parsed.bubbleScale))
        ? Math.max(0.25, Math.min(8, Number(parsed.bubbleScale)))
        : 1,
      backImageDataUrl,
    };

    token = putCoverSpec(spec);

    const hostHeader = request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') ?? 'http';
    const origin = hostHeader ? `${proto}://${hostHeader}` : 'http://127.0.0.1:3000';
    const printUrl = new URL(`/cover/print`, origin);
    printUrl.searchParams.set('token', token);

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

    const totalWidthIn = spec.trimWidthIn * 2 + spec.spineWidthIn + spec.bleedIn * 2;
    const totalHeightIn = spec.trimHeightIn + spec.bleedIn * 2;

    const page = await browser.newPage();
    await page.setViewport({
      width: Math.max(spec.columnWidthPx + 80, 1024),
      height: 1024,
      deviceScaleFactor: 2,
    });

    await page.goto(printUrl.toString(), {
      waitUntil: 'networkidle0',
      timeout: 60_000,
    });

    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-print-ready') === '1',
      { timeout: 60_000 },
    );

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: false,
      width: `${totalWidthIn}in`,
      height: `${totalHeightIn}in`,
      margin: { top: '0in', right: '0in', bottom: '0in', left: '0in' },
    });

    // Chromium rounds page size to integer device pixels (~0.008 in drift),
    // which can fall outside Lulu's tolerance for some validators. Open the
    // PDF and force the MediaBox to the exact target dimensions in points.
    // The visible content was rendered at the requested size minus that
    // tiny rounding, so trimming the MediaBox by ≤1 pt only crops a sliver
    // of bleed-area background — never inside the safe area.
    const targetWidthPts = totalWidthIn * 72;
    const targetHeightPts = totalHeightIn * 72;
    const fixed = await PDFDocument.load(pdfBuffer);
    for (const p of fixed.getPages()) {
      p.setSize(targetWidthPts, targetHeightPts);
    }
    const finalBytes = await fixed.save();

    // Self-verification: re-parse the bytes we're about to ship and confirm
    // every page's MediaBox matches the requested target. Refuse to return a
    // wrong-sized PDF — that's how Lulu validation failures sneak through.
    const verify = await PDFDocument.load(finalBytes);
    const pageCount = verify.getPageCount();
    if (pageCount !== 1) {
      throw new Error(`expected exactly 1 page, got ${pageCount}`);
    }
    for (const p of verify.getPages()) {
      const { width, height } = p.getSize();
      const dW = Math.abs(width - targetWidthPts);
      const dH = Math.abs(height - targetHeightPts);
      if (dW > 0.001 || dH > 0.001) {
        throw new Error(
          `cover dim mismatch: got ${(width / 72).toFixed(4)} × ${(height / 72).toFixed(4)} in, ` +
            `want ${(targetWidthPts / 72).toFixed(4)} × ${(targetHeightPts / 72).toFixed(4)} in`,
        );
      }
    }

    return new NextResponse(finalBytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="cover-${Date.now()}.pdf"`,
        'X-Cover-Width-In': (targetWidthPts / 72).toFixed(4),
        'X-Cover-Height-In': (targetHeightPts / 72).toFixed(4),
        'X-Cover-Spine-In': spec.spineWidthIn.toFixed(4),
      },
    });
  } catch (error) {
    console.error('Cover PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate cover PDF', details: String(error) },
      { status: 500 },
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (token) deleteCoverSpec(token);
  }
}
