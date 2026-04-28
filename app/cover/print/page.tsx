'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import MessageBubble from '@/components/MessageBubble';
import type { CoverSpec } from '@/lib/cover/spec';

// Single-page cover spread for print-on-demand (Lulu, Blurb, BookVault).
// Layout, left → right when the cover is laid flat: BACK | SPINE | FRONT.
// Total page = (trim_w + bleed) + spine_w + (trim_w + bleed)
//            × (trim_h + 2 × bleed). Bleed extends past the trim line on the
// three outer edges (top, bottom, and the cover-side outer edge).

export default function CoverPrintPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [spec, setSpec] = useState<CoverSpec | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('missing token');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cover-spec/${token}`);
        if (!res.ok) throw new Error(`spec fetch failed: ${res.status}`);
        const data = (await res.json()) as CoverSpec;
        if (!cancelled) setSpec(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Tell Puppeteer the page is ready once spec + back image (if any) have loaded.
  useEffect(() => {
    if (!spec) return;
    if (typeof document === 'undefined') return;

    const finish = () => {
      document.documentElement.setAttribute('data-print-ready', '1');
    };

    if (!spec.backImageDataUrl) {
      requestAnimationFrame(finish);
      return;
    }

    const img = new Image();
    img.onload = finish;
    img.onerror = finish;
    img.src = spec.backImageDataUrl;
  }, [spec]);

  if (error) {
    return <div style={{ padding: 32, color: '#b91c1c' }}>{error}</div>;
  }
  if (!spec) {
    return null;
  }

  const totalWidthIn = spec.trimWidthIn * 2 + spec.spineWidthIn + spec.bleedIn * 2;
  const totalHeightIn = spec.trimHeightIn + spec.bleedIn * 2;
  const backFaceWidthIn = spec.trimWidthIn + spec.bleedIn;
  const frontFaceWidthIn = spec.trimWidthIn + spec.bleedIn;

  return (
    <>
      <style>{`
        @page { margin: 0; size: ${totalWidthIn}in ${totalHeightIn}in; }
        html, body { margin: 0; padding: 0; background: #fff; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
        }
      `}</style>

      <section
        style={{
          width: `${totalWidthIn}in`,
          height: `${totalHeightIn}in`,
          display: 'flex',
          flexDirection: 'row',
          boxSizing: 'border-box',
          backgroundColor: '#ffffff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Back cover (with outer bleed on left, top, bottom). */}
        <div
          style={{
            width: `${backFaceWidthIn}in`,
            height: '100%',
            position: 'relative',
            backgroundColor: '#000',
            overflow: 'hidden',
          }}
        >
          {spec.backImageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={spec.backImageDataUrl}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', backgroundColor: '#fff' }} />
          )}
        </div>

        {/* Spine. */}
        <div
          style={{
            width: `${spec.spineWidthIn}in`,
            height: '100%',
            backgroundColor: spec.spineColor,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {spec.spineText && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%) rotate(-90deg)',
                whiteSpace: 'nowrap',
                color: spec.spineTextColor,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
            >
              {spec.spineText}
            </div>
          )}
        </div>

        {/* Front cover. Bleed offsets outer edges; marginIn from each trim
            edge keeps the bubble column inside the safe area. */}
        <div
          style={{
            width: `${frontFaceWidthIn}in`,
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: '#fff',
            paddingTop: `${spec.bleedIn + spec.marginIn}in`,
            paddingBottom: `${spec.bleedIn + spec.marginIn}in`,
            paddingLeft: `${spec.marginIn}in`,
            paddingRight: `${spec.bleedIn + spec.marginIn}in`,
            boxSizing: 'border-box',
          }}
        >
          <FrontCoverContent spec={spec} />
        </div>
      </section>
    </>
  );
}

function FrontCoverContent({ spec }: { spec: CoverSpec }) {
  const scale = spec.bubbleScale || 1;
  // Column width grows with scale so a 2× bubble lives in a wider column.
  const columnPx = spec.columnWidthPx * scale;
  const messages = spec.messages;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          maxWidth: `${columnPx}px`,
          width: '100%',
          margin: '0 auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          // Bubble row's swipe-timestamp glyph sits at right:-58px; even
          // though we hide it explicitly, keep an overflow clip so any future
          // out-of-bound glyphs (reactions, etc.) are bounded by the safe area.
          overflowX: 'hidden',
        }}
      >
        {spec.dateLabel && <DateHeader label={spec.dateLabel} scale={scale} />}
        <div style={{ marginTop: 0.5 * 96 * scale }}>
          {messages.map((m, i) => {
            const next = messages[i + 1];
            const isLastOfRun = !next || next.isFromMe !== m.isFromMe;
            return (
              <MessageBubble
                key={i}
                message={{
                  ROWID: i,
                  text: m.text,
                  date: Number.NaN, // disables the centered/swipe time glyphs
                  is_from_me: m.isFromMe ? 1 : 0,
                  handle_id: null,
                }}
                handle={null}
                attachments={[]}
                reactions={[]}
                dbPath=""
                attachmentsPath=""
                showTimestamp={false}
                showSenderLabel={false}
                isLastOfRun={isLastOfRun}
                scale={scale}
                hideSwipeTimestamp
              />
            );
          })}
          {spec.showTypingIndicator && <TypingBubble scale={scale} />}
        </div>
      </div>
    </div>
  );
}

function DateHeader({ label, scale }: { label: string; scale: number }) {
  const parts = label.split(/,\s*(?=\d{1,2}:\d{2})/);
  const datePart = parts[0] ?? label;
  const timePart = parts[1] ?? '';
  return (
    <div style={{ textAlign: 'center', fontSize: 13 * scale, color: '#8E8E93' }}>
      <span style={{ color: '#1c1c1e', fontWeight: 600 }}>{datePart}</span>
      {timePart && <span style={{ color: '#8E8E93' }}>{`, ${timePart}`}</span>}
    </div>
  );
}

function TypingBubble({ scale }: { scale: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 4 * scale }}>
      <div
        style={{
          backgroundColor: '#E9E9EB',
          padding: `${10 * scale}px ${14 * scale}px`,
          borderRadius: `${18 * scale}px`,
          borderBottomLeftRadius: `${4 * scale}px`,
          display: 'flex',
          gap: 4 * scale,
          alignItems: 'center',
        }}
      >
        <Dot scale={scale} />
        <Dot scale={scale} />
        <Dot scale={scale} />
      </div>
    </div>
  );
}

function Dot({ scale }: { scale: number }) {
  return (
    <span
      style={{
        width: 8 * scale,
        height: 8 * scale,
        borderRadius: '50%',
        backgroundColor: '#A8A8AD',
        display: 'inline-block',
      }}
    />
  );
}
