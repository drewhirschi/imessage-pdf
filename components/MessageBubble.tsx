'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import ImageAttachment from './ImageAttachment';
import VideoAttachment from './VideoAttachment';
import VCardAttachment from './VCardAttachment';
import LocationAttachment from './LocationAttachment';
import LinkCard from './LinkCard';
import ReactionIndicator from './ReactionIndicator';
import ReactionDetailsModal from './ReactionDetailsModal';
import InlineNameEditor from './InlineNameEditor';
import { imessageToDate } from '@/lib/utils/timestamp';
import { classifyMessage } from '@/lib/link-preview/classify';
import type { RichLink } from '@/lib/link-preview/decode';
import { useContactsOptional } from './ContactsProvider';
import type { Reaction } from '@/lib/db/types';

interface Message {
  ROWID: number;
  text: string | null;
  date: number;
  is_from_me: number;
  handle_id: number | null;
}

interface Handle {
  ROWID: number;
  id: string;
  service: string | null;
}

interface Attachment {
  ROWID: number;
  filename: string | null;
  mime_type: string | null;
}

interface MessageBubbleProps {
  message: Message;
  handle: Handle | null;
  attachments: Attachment[];
  reactions?: Reaction[];
  richLink?: RichLink | null;
  dbPath: string;
  attachmentsPath: string;
  /** Show the centered time separator above this bubble (iMessage shows this on 5-min gaps). */
  showTimestamp?: boolean;
  /** Show the sender name above this bubble (group chats, first bubble of a sender's run). */
  showSenderLabel?: boolean;
  /** This is the last message in the sender's run — render the "tail" corner. */
  isLastOfRun?: boolean;
  /** Render for the static print/PDF page: link cards gain a QR code. */
  forPrint?: boolean;
}

function renderTextWithLinks(text: string, isFromMe: boolean) {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlPattern);

  return parts.map((part, index) => {
    if (part.match(urlPattern)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline hover:opacity-80 ${isFromMe ? 'text-blue-100' : 'text-blue-600'}`}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

type AttachmentKind = 'image' | 'video' | 'vcard' | 'location' | 'other';

function classifyAttachment(attachment: Attachment): AttachmentKind {
  const mime = attachment.mime_type ?? '';
  const filename = attachment.filename ?? '';
  if (mime === 'text/x-vlocation' || /\.loc\.vcf$/i.test(filename)) return 'location';
  if (mime === 'text/vcard' || mime === 'text/x-vcard' || /\.vcf$/i.test(filename)) return 'vcard';
  if (
    mime.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp|heic|heif|pluginPayloadAttachment)$/i.test(filename)
  )
    return 'image';
  if (mime.startsWith('video/') || /\.(mov|mp4|avi|webm|m4v|mkv)$/i.test(filename)) return 'video';
  return 'other';
}

export default function MessageBubble({
  message,
  handle,
  attachments,
  reactions = [],
  richLink = null,
  dbPath,
  attachmentsPath,
  showTimestamp = false,
  showSenderLabel = false,
  isLastOfRun = true,
  forPrint = false,
}: MessageBubbleProps) {
  const [showReactionModal, setShowReactionModal] = useState(false);
  const isFromMe = message.is_from_me === 1;
  const contacts = useContactsOptional();
  const rawSender = handle?.id ?? null;
  const resolved = rawSender ? contacts?.resolve(rawSender) ?? null : null;
  const senderName = resolved ?? rawSender ?? 'Unknown';
  const timestamp = imessageToDate(message.date);
  const isValidDate = !isNaN(timestamp.getTime());
  const cleanText = message.text?.replace(/￼/g, '').trim() || null;

  // Decide how the URL(s) in the text drive rendering.
  const shape = classifyMessage(cleanText);
  const bareUrl = !richLink && shape.shape === 'bare-url' ? shape.urls[0] : null;
  const linkUrl = richLink?.url ?? bareUrl;
  // A bare URL / rich link is represented by the card, so hide the raw text.
  const showTextBubble = !!cleanText && !bareUrl && !richLink;

  const tailCorner = isFromMe ? 'rounded-br-[4px]' : 'rounded-bl-[4px]';

  // Partition attachments; images can collage into a grid, everything else is
  // its own bubble in the stack (iMessage behaviour).
  const images = attachments.filter((a) => classifyAttachment(a) === 'image');
  const nonImages = attachments.filter((a) => classifyAttachment(a) !== 'image');

  // Build the vertical stack of bubbles (media/cards on top, text below).
  // Each entry renders its own root element and merges in `tail` (the tail
  // corner class) so only the last bubble of the stack carries the tail.
  const stack: Array<{ key: string; render: (tail: string) => React.ReactNode }> = [];

  // 1) Images — single media bubble, or a 2-up collage.
  if (images.length === 1) {
    stack.push({
      key: 'img',
      render: (tail) => (
        <div className={`message-bubble-item overflow-hidden rounded-[18px] ${tail} bg-black/5 max-w-[260px]`}>
          <ImageAttachment
            attachmentId={images[0].ROWID}
            filename={images[0].filename}
            dbPath={dbPath}
            attachmentsPath={attachmentsPath}
          />
        </div>
      ),
    });
  } else if (images.length > 1) {
    stack.push({
      key: 'imggrid',
      render: (tail) => (
        <div
          className={`message-bubble-item grid grid-cols-2 gap-[2px] overflow-hidden rounded-[18px] ${tail} bg-black/5`}
          style={{ width: 248 }}
        >
          {images.map((img) => (
            <div key={img.ROWID} className="aspect-square overflow-hidden">
              <ImageAttachment
                attachmentId={img.ROWID}
                filename={img.filename}
                dbPath={dbPath}
                attachmentsPath={attachmentsPath}
                variant="cover"
              />
            </div>
          ))}
        </div>
      ),
    });
  }

  // 2) Non-image attachments — each its own bubble.
  for (const attachment of nonImages) {
    const kind = classifyAttachment(attachment);
    stack.push({
      key: `att-${attachment.ROWID}`,
      render: (tail) =>
        kind === 'location' ? (
          <div className={`message-bubble-item max-w-[280px] overflow-hidden rounded-[14px] ${tail}`}>
            <LocationAttachment
              attachmentId={attachment.ROWID}
              filename={attachment.filename}
              dbPath={dbPath}
              attachmentsPath={attachmentsPath}
              isFromMe={isFromMe}
            />
          </div>
        ) : kind === 'vcard' ? (
          <div className={`message-bubble-item max-w-[280px] overflow-hidden rounded-[14px] ${tail}`}>
            <VCardAttachment
              attachmentId={attachment.ROWID}
              filename={attachment.filename}
              dbPath={dbPath}
              attachmentsPath={attachmentsPath}
              isFromMe={isFromMe}
            />
          </div>
        ) : kind === 'video' ? (
          <div className={`message-bubble-item overflow-hidden rounded-[18px] ${tail} bg-black/5 max-w-[280px]`}>
            <VideoAttachment
              attachmentId={attachment.ROWID}
              filename={attachment.filename}
              dbPath={dbPath}
              attachmentsPath={attachmentsPath}
            />
          </div>
        ) : (
          <div className={`message-bubble-item bg-black/10 rounded-[14px] ${tail} p-2 max-w-[280px]`}>
            <p className="text-[13px] break-all">📎 {attachment.filename || 'Unknown file'}</p>
          </div>
        ),
    });
  }

  // 3) Link preview card (rich link, or a bare-URL text message).
  if (linkUrl) {
    stack.push({
      key: 'link',
      render: (tail) => (
        <LinkCard
          url={linkUrl}
          rich={richLink}
          isFromMe={isFromMe}
          forPrint={forPrint}
          className={`message-bubble-item ${tail}`}
        />
      ),
    });
  }

  // 4) Text bubble.
  if (showTextBubble) {
    stack.push({
      key: 'text',
      render: (tail) => (
        <div
          className={`message-bubble-item rounded-[18px] ${tail} px-3 py-[6px] text-[15px] leading-[20px] ${
            isFromMe ? 'bg-[#007AFF] text-white' : 'bg-[#E9E9EB] text-black'
          }`}
          style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
          }}
        >
          <p className="whitespace-pre-wrap break-words">
            {renderTextWithLinks(cleanText!, isFromMe)}
          </p>
        </div>
      ),
    });
  }

  // Empty message with nothing to show (e.g. stray tapback) — render nothing.
  if (stack.length === 0) return null;

  const lastIndex = stack.length - 1;

  return (
    <>
      {/* Centered time separator on 5-min gaps */}
      {showTimestamp && isValidDate && (
        <div className="text-center text-[11px] text-[#8E8E93] my-3">
          {format(timestamp, 'h:mm a')}
        </div>
      )}

      {/* Sender name for group chats, first bubble of sender's run */}
      {showSenderLabel && !isFromMe && (
        <div className="px-3 mb-0.5 flex items-center gap-1">
          <span className="text-[12px] text-[#8E8E93]">{senderName}</span>
          {rawSender && !resolved && contacts?.contactsPath && (
            <InlineNameEditor handleId={rawSender} />
          )}
        </div>
      )}

      <div
        className={`relative flex ${isFromMe ? 'justify-end' : 'justify-start'} ${
          isLastOfRun ? 'mb-2' : 'mb-0.5'
        } ${reactions.length > 0 ? 'mt-6' : ''}`}
      >
        {/* Swipe-revealed exact timestamp — sits outside the bubble row. */}
        {isValidDate && (
          <span className="absolute top-1/2 -translate-y-1/2 right-[-58px] w-12 text-right text-[11px] text-[#8E8E93] whitespace-nowrap pointer-events-none select-none">
            {format(timestamp, 'h:mm a')}
          </span>
        )}
        <div
          className={`max-w-[75%] ${isFromMe ? 'order-2 items-end' : 'order-1 items-start'} relative flex flex-col gap-[2px]`}
        >
          {stack.map((item, i) => {
            // Only the last bubble of the stack gets the tail corner.
            const isTail = i === lastIndex && isLastOfRun;
            return (
              <div key={item.key}>{item.render(isTail ? tailCorner : '')}</div>
            );
          })}

          {reactions.length > 0 && (
            <ReactionIndicator
              reactions={reactions}
              isFromMe={isFromMe}
              onClick={() => setShowReactionModal(true)}
            />
          )}
        </div>
      </div>

      <ReactionDetailsModal
        reactions={reactions}
        isOpen={showReactionModal}
        onClose={() => setShowReactionModal(false)}
      />
    </>
  );
}
