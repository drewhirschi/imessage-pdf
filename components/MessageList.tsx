'use client';

import { format } from 'date-fns';
import MessageBubble from './MessageBubble';
import {
  imessageToDate,
  isMoreThan5MinutesApart,
  isDifferentDay,
} from '@/lib/utils/timestamp';
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

export interface MessageWithAttachments {
  message: Message;
  handle: Handle | null;
  attachments: Attachment[];
  reactions?: Reaction[];
}

interface Props {
  messages: MessageWithAttachments[];
  isGroup: boolean;
  dbPath: string;
  attachmentsPath: string;
}

const sameSender = (
  a: MessageWithAttachments | null,
  b: MessageWithAttachments,
) =>
  !!a &&
  a.message.is_from_me === b.message.is_from_me &&
  (a.handle?.id ?? null) === (b.handle?.id ?? null);

export default function MessageList({
  messages,
  isGroup,
  dbPath,
  attachmentsPath,
}: Props) {
  return (
    <>
      {messages.map((current, index) => {
        const prev = index > 0 ? messages[index - 1] : null;
        const next = index < messages.length - 1 ? messages[index + 1] : null;

        const timeGapBefore =
          !prev || isMoreThan5MinutesApart(prev.message.date, current.message.date);
        const timeGapAfter =
          !next || isMoreThan5MinutesApart(current.message.date, next.message.date);

        const showTimestamp = Boolean(timeGapBefore);

        const showDateSeparator = Boolean(
          index === 0 ||
            (prev && isDifferentDay(prev.message.date, current.message.date)),
        );

        const isFirstOfRun =
          !sameSender(prev, current) || timeGapBefore || showDateSeparator;
        const isLastOfRun = !sameSender(next, current) || timeGapAfter;

        const showSenderLabel =
          isGroup && !current.message.is_from_me && isFirstOfRun;

        const currentDate = imessageToDate(current.message.date);

        return (
          <div key={current.message.ROWID}>
            {showDateSeparator && (
              <div className="text-center text-[11px] text-[#8E8E93] font-semibold my-4">
                {format(currentDate, 'EEEE, MMMM d, yyyy')}
              </div>
            )}

            <MessageBubble
              message={current.message}
              handle={current.handle}
              attachments={current.attachments}
              reactions={current.reactions}
              dbPath={dbPath}
              attachmentsPath={attachmentsPath}
              showTimestamp={showTimestamp}
              showSenderLabel={showSenderLabel}
              isLastOfRun={isLastOfRun}
            />
          </div>
        );
      })}
    </>
  );
}
