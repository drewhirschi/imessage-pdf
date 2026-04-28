'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import ImageAttachment from './ImageAttachment';
import VideoAttachment from './VideoAttachment';
import VCardAttachment from './VCardAttachment';
import LocationAttachment from './LocationAttachment';
import ReactionIndicator from './ReactionIndicator';
import ReactionDetailsModal from './ReactionDetailsModal';
import InlineNameEditor from './InlineNameEditor';
import { imessageToDate } from '@/lib/utils/timestamp';
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
  dbPath: string;
  attachmentsPath: string;
  /** Show the centered time separator above this bubble (iMessage shows this on 5-min gaps). */
  showTimestamp?: boolean;
  /** Show the sender name above this bubble (group chats, first bubble of a sender's run). */
  showSenderLabel?: boolean;
  /** This is the last message in the sender's run — render the "tail" corner. */
  isLastOfRun?: boolean;
  /** Multiplier on font, padding, line-height, radii, and run spacing. 1 = native iMessage. */
  scale?: number;
  /** Hide the swipe-revealed exact-timestamp glyph (used by static print contexts). */
  hideSwipeTimestamp?: boolean;
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

export default function MessageBubble({
  message,
  handle,
  attachments,
  reactions = [],
  dbPath,
  attachmentsPath,
  showTimestamp = false,
  showSenderLabel = false,
  isLastOfRun = true,
  scale = 1,
  hideSwipeTimestamp = false,
}: MessageBubbleProps) {
  const [showReactionModal, setShowReactionModal] = useState(false);
  const isFromMe = message.is_from_me === 1;
  const contacts = useContactsOptional();
  const rawSender = handle?.id ?? null;
  const resolved = rawSender ? contacts?.resolve(rawSender) ?? null : null;
  const senderName = resolved ?? rawSender ?? 'Unknown';
  const timestamp = imessageToDate(message.date);
  const isValidDate = !isNaN(timestamp.getTime());
  const cleanText = message.text?.replace(/\uFFFC/g, '').trim() || null;

  // iOS 14 iMessage colors + radii. All sizes flow through `scale` so the
  // cover generator can render the same component at 2× / 3× while keeping
  // pixel-identical proportions to the live conversation viewer (scale=1).
  const bubbleColorClass = isFromMe
    ? 'bg-[#007AFF] text-white'
    : 'bg-[#E9E9EB] text-black';
  const radius = 18 * scale;
  const tailRadius = 4 * scale;
  const padX = 12 * scale;
  const padY = 6 * scale;
  const fontSize = 15 * scale;
  const lineHeight = 20 * scale;
  const runMarginPx = (isLastOfRun ? 8 : 2) * scale;
  const reactionMarginTopPx = reactions.length > 0 ? 24 * scale : 0;

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
        className={`relative flex ${isFromMe ? 'justify-end' : 'justify-start'}`}
        style={{
          marginBottom: runMarginPx,
          marginTop: reactionMarginTopPx,
        }}
      >
        {/* Swipe-revealed exact timestamp — sits outside the bubble row, revealed when the list pans left. */}
        {isValidDate && !hideSwipeTimestamp && (
          <span className="absolute top-1/2 -translate-y-1/2 right-[-58px] w-12 text-right text-[11px] text-[#8E8E93] whitespace-nowrap pointer-events-none select-none">
            {format(timestamp, 'h:mm a')}
          </span>
        )}
        <div className={`max-w-[75%] ${isFromMe ? 'order-2' : 'order-1'} relative`}>
          <div
            className={bubbleColorClass}
            style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
              fontSize: `${fontSize}px`,
              lineHeight: `${lineHeight}px`,
              padding: `${padY}px ${padX}px`,
              borderRadius: `${radius}px`,
              borderBottomRightRadius: `${isFromMe && isLastOfRun ? tailRadius : radius}px`,
              borderBottomLeftRadius: `${!isFromMe && isLastOfRun ? tailRadius : radius}px`,
            }}
          >
            {cleanText && (
              <p className="whitespace-pre-wrap break-words">
                {renderTextWithLinks(cleanText, isFromMe)}
              </p>
            )}

            {attachments.length > 0 && (
              <div className={cleanText ? 'mt-1.5 space-y-1.5' : 'space-y-1.5'}>
                {attachments.map((attachment) => {
                  const mime = attachment.mime_type ?? '';
                  const filename = attachment.filename ?? '';
                  const isLocation =
                    mime === 'text/x-vlocation' ||
                    /\.loc\.vcf$/i.test(filename);
                  const isVCard =
                    !isLocation &&
                    (mime === 'text/vcard' ||
                      mime === 'text/x-vcard' ||
                      /\.vcf$/i.test(filename));
                  const isImage =
                    !isVCard &&
                    !isLocation &&
                    (mime.startsWith('image/') ||
                      /\.(jpg|jpeg|png|gif|webp|heic|heif|pluginPayloadAttachment)$/i.test(filename));
                  const isVideo =
                    !isVCard &&
                    !isLocation &&
                    (mime.startsWith('video/') ||
                      /\.(mov|mp4|avi|webm|m4v|mkv)$/i.test(filename));

                  return (
                    <div key={attachment.ROWID}>
                      {isLocation ? (
                        <LocationAttachment
                          attachmentId={attachment.ROWID}
                          filename={attachment.filename}
                          dbPath={dbPath}
                          attachmentsPath={attachmentsPath}
                          isFromMe={isFromMe}
                        />
                      ) : isVCard ? (
                        <VCardAttachment
                          attachmentId={attachment.ROWID}
                          filename={attachment.filename}
                          dbPath={dbPath}
                          attachmentsPath={attachmentsPath}
                          isFromMe={isFromMe}
                        />
                      ) : isImage ? (
                        <ImageAttachment
                          attachmentId={attachment.ROWID}
                          filename={attachment.filename}
                          dbPath={dbPath}
                          attachmentsPath={attachmentsPath}
                        />
                      ) : isVideo ? (
                        <VideoAttachment
                          attachmentId={attachment.ROWID}
                          filename={attachment.filename}
                          dbPath={dbPath}
                          attachmentsPath={attachmentsPath}
                        />
                      ) : (
                        <div className="bg-black bg-opacity-10 rounded-lg p-2">
                          <p className="text-[13px]">
                            📎 {attachment.filename || 'Unknown file'}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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
