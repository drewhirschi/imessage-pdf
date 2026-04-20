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
  showTimestamp?: boolean;
  showDateSeparator?: boolean;
}

// Helper function to detect and render URLs as clickable links
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
}: MessageBubbleProps) {
  const [showReactionModal, setShowReactionModal] = useState(false);
  const isFromMe = message.is_from_me === 1;
  const contacts = useContactsOptional();
  const rawSender = handle?.id ?? null;
  const resolved = rawSender ? contacts?.resolve(rawSender) ?? null : null;
  const sender = isFromMe ? 'You' : resolved ?? rawSender ?? 'Unknown';
  const timestamp = imessageToDate(message.date);
  const isValidDate = !isNaN(timestamp.getTime());
  // iMessage inserts U+FFFC (object replacement char) where attachments sit in text
  const cleanText = message.text?.replace(/\uFFFC/g, '').trim() || null;

  return (
    <>
      <div className={`flex ${isFromMe ? 'justify-end' : 'justify-start'} mb-4`}>
        <div className={`max-w-xs lg:max-w-md ${isFromMe ? 'order-2' : 'order-1'}`}>
          {showTimestamp && (
            <div className={`text-xs text-gray-500 mb-1 flex items-center gap-1 ${isFromMe ? 'justify-end' : 'justify-start'}`}>
              <span className="font-medium">{sender}</span>
              {!isFromMe && rawSender && !resolved && contacts?.contactsPath && (
                <InlineNameEditor handleId={rawSender} />
              )}
              {isValidDate && <span className="ml-1">{format(timestamp, 'h:mm a')}</span>}
            </div>
          )}

          <div className="relative">
            <div
              className={`rounded-2xl px-4 py-2 ${
                isFromMe
                  ? 'bg-blue-500 text-white rounded-br-md'
                  : 'bg-gray-200 text-gray-900 rounded-bl-md'
              }`}
            >
              {cleanText && (
                <p className="text-sm whitespace-pre-wrap break-words">
                  {renderTextWithLinks(cleanText, isFromMe)}
                </p>
              )}

              {attachments.length > 0 && (
                <div className="mt-2 space-y-2">
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
                            <p className="text-xs">
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
      </div>

      <ReactionDetailsModal
        reactions={reactions}
        isOpen={showReactionModal}
        onClose={() => setShowReactionModal(false)}
      />
    </>
  );
}
