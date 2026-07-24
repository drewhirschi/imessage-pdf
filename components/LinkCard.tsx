'use client';

import { displayDomain } from '@/lib/link-preview/classify';
import type { RichLink } from '@/lib/link-preview/decode';
import QRCodeSVG from './QRCode';

interface LinkCardProps {
  url: string;
  /** Decoded rich preview (title / site name), if available. */
  rich?: RichLink | null;
  /** Sent bubbles get a subtle tint; received cards stay light. */
  isFromMe: boolean;
  /** Print/PDF render: append a scannable QR code. */
  forPrint?: boolean;
  /** Extra classes merged onto the card root (e.g. the tail corner). */
  className?: string;
}

/**
 * An iMessage-style link preview card. It renders as its own bubble (stacked
 * above/instead of the text bubble). No network fetches: the title/site name
 * come from the decoded LPLinkMetadata (payload_data); otherwise we show a
 * clean domain-prominent card. In the print route it also carries a QR code so
 * the link survives on paper.
 */
export default function LinkCard({
  url,
  rich,
  isFromMe,
  forPrint = false,
  className = '',
}: LinkCardProps) {
  const domain = displayDomain(url);
  const title = rich?.title?.trim();
  const site = rich?.siteName?.trim() || domain;

  const cardBg = isFromMe ? 'bg-[#0063d1]' : 'bg-[#dedee0]';
  const titleColor = isFromMe ? 'text-white' : 'text-black';
  const metaColor = isFromMe ? 'text-white/70' : 'text-[#8E8E93]';

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block w-full max-w-[280px] rounded-[14px] overflow-hidden no-underline ${cardBg} ${className}`}
      style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}
    >
      {/* Header strip: domain monogram + site name, evokes the LP header row. */}
      <div className="flex items-stretch gap-2.5 px-3 py-2.5">
        <div
          className={`flex-shrink-0 self-center w-9 h-9 rounded-lg flex items-center justify-center text-[15px] font-semibold ${
            isFromMe ? 'bg-white/20 text-white' : 'bg-white text-[#007AFF]'
          }`}
          aria-hidden
        >
          {domain.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          {title ? (
            <>
              <div className={`text-[13px] font-semibold leading-[17px] ${titleColor} line-clamp-2 break-words`}>
                {title}
              </div>
              <div className={`text-[11px] ${metaColor} truncate mt-0.5`}>{site}</div>
            </>
          ) : (
            <>
              <div className={`text-[13px] font-semibold leading-[17px] ${titleColor} truncate`}>
                {domain}
              </div>
              <div className={`text-[11px] ${metaColor} truncate mt-0.5 break-all`}>{url}</div>
            </>
          )}
        </div>
        {forPrint && (
          <QRCodeSVG
            value={url}
            size={64}
            wrapperClassName="flex-shrink-0 self-center bg-white p-1 rounded-md"
          />
        )}
      </div>
    </a>
  );
}
