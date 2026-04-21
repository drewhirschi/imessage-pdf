'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import DateRangePicker from '@/components/DateRangePicker';
import InfiniteScroll from 'react-infinite-scroll-component';
import MessageList from '@/components/MessageList';
import PDFOptionsDialog, { type PDFOptions } from '@/components/PDFOptionsDialog';
import { unixToImessageTimestamp } from '@/lib/utils/timestamp';
import { ContactsProvider, useContactsOptional } from '@/components/ContactsProvider';
import InlineNameEditor from '@/components/InlineNameEditor';
import SwipeForTimestamps from '@/components/SwipeForTimestamps';
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

interface MessageWithAttachments {
  message: Message;
  handle: Handle | null;
  attachments: Attachment[];
  reactions?: Reaction[];
}

interface ConversationDetails {
  chat_id: number;
  display_name: string | null;
  participants: string[];
  is_group: boolean;
}

// iPhone-ish viewport widths. Logical pt = CSS px in standard DPR.
const DEFAULT_COLUMN_WIDTH = 430;
const MIN_COLUMN_WIDTH = 320;
const MAX_COLUMN_WIDTH = 820;
const COLUMN_WIDTH_STORAGE_KEY = 'imessage-column-width';
const SNAP_POINTS: { width: number; label: string }[] = [
  { width: 375, label: 'iPhone 8 / SE' },
  { width: 390, label: 'iPhone 12 / 14' },
  { width: 393, label: 'iPhone 15 Pro' },
  { width: 430, label: 'iPhone 15 Pro Max' },
  { width: 768, label: 'iPad mini' },
];
const SNAP_THRESHOLD = 10; // px — within this of a snap point, magnetize.

function snap(raw: number): number {
  for (const pt of SNAP_POINTS) {
    if (Math.abs(raw - pt.width) <= SNAP_THRESHOLD) return pt.width;
  }
  return raw;
}
function labelFor(width: number): string | null {
  return SNAP_POINTS.find((p) => p.width === width)?.label ?? null;
}

export default function ConversationPage() {
  const searchParams = useSearchParams();
  const contactsPath = searchParams.get('contactsPath') || '';

  return (
    <ContactsProvider contactsPath={contactsPath}>
      <ConversationPageInner />
    </ContactsProvider>
  );
}

function ConversationPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const chatId = params.id as string;
  const dbPath = searchParams.get('dbPath') || '';
  const attachmentsPath = searchParams.get('attachmentsPath') || '';
  const contactsPath = searchParams.get('contactsPath') || '';
  const contacts = useContactsOptional();

  const getInitialDateFromURL = (paramName: string): Date | null => {
    const dateString = searchParams.get(paramName);
    if (!dateString) return null;
    try {
      const date = new Date(dateString + 'T00:00:00');
      if (isNaN(date.getTime())) return null;
      return date;
    } catch {
      return null;
    }
  };

  const [messages, setMessages] = useState<MessageWithAttachments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(getInitialDateFromURL('startDate'));
  const [endDate, setEndDate] = useState<Date | null>(getInitialDateFromURL('endDate'));
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [conversationDetails, setConversationDetails] = useState<ConversationDetails | null>(null);
  const [columnWidth, setColumnWidth] = useState<number>(DEFAULT_COLUMN_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const PAGE_SIZE = 500;

  useEffect(() => {
    const saved = localStorage.getItem(COLUMN_WIDTH_STORAGE_KEY);
    if (saved) {
      const n = parseInt(saved, 10);
      if (!Number.isNaN(n) && n >= MIN_COLUMN_WIDTH && n <= MAX_COLUMN_WIDTH) {
        setColumnWidth(n);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(COLUMN_WIDTH_STORAGE_KEY, String(columnWidth));
  }, [columnWidth]);

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: columnWidth };
    setIsDragging(true);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };
  const onDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const delta = e.clientX - dragRef.current.startX;
    // Column is centered, so growing one side grows both. 2x delta = new total width.
    const raw = Math.min(
      MAX_COLUMN_WIDTH,
      Math.max(MIN_COLUMN_WIDTH, dragRef.current.startWidth + delta * 2),
    );
    setColumnWidth(snap(raw));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
  };
  const currentSnapLabel = labelFor(columnWidth);

  const fetchMessages = useCallback(async (pageNum: number, reset: boolean = false) => {
    try {
      if (reset) {
        setLoading(true);
      }
      setError(null);

      const url = new URL('/api/messages', window.location.origin);
      url.searchParams.set('chatId', chatId);
      url.searchParams.set('dbPath', dbPath);
      url.searchParams.set('page', pageNum.toString());
      url.searchParams.set('limit', PAGE_SIZE.toString());
      url.searchParams.set('getDetails', pageNum === 1 ? 'true' : 'false');
      if (startDate) {
        const unixTimestamp = Math.floor(startDate.getTime() / 1000);
        const imessageTimestamp = unixToImessageTimestamp(unixTimestamp);
        url.searchParams.set('startDate', imessageTimestamp.toString());
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        const unixTimestamp = Math.floor(endOfDay.getTime() / 1000);
        const imessageTimestamp = unixToImessageTimestamp(unixTimestamp);
        url.searchParams.set('endDate', imessageTimestamp.toString());
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }

      const data = await response.json();

      if (reset) {
        setMessages(data.messages);
      } else {
        setMessages(prev => [...prev, ...data.messages]);
      }

      setHasMore(data.hasMore);
      setTotalCount(data.total);
      setPage(pageNum);

      if (data.conversationDetails) {
        setConversationDetails(data.conversationDetails);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      if (reset) {
        setLoading(false);
      }
    }
  }, [chatId, dbPath, startDate, endDate, PAGE_SIZE]);

  const fetchMoreMessages = useCallback(() => {
    if (!loading && hasMore) {
      fetchMessages(page + 1, false);
    }
  }, [page, loading, hasMore, fetchMessages]);

  const fetchMessagesRef = useCallback(fetchMessages, [fetchMessages]);

  useEffect(() => {
    if (dbPath && attachmentsPath) {
      setPage(1);
      setHasMore(true);
      fetchMessagesRef(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbPath, attachmentsPath, startDate, endDate]);

  const handleDateRangeChange = (start: Date | null, end: Date | null) => {
    setStartDate(start);
    setEndDate(end);

    const params = new URLSearchParams(window.location.search);

    if (start) {
      params.set('startDate', format(start, 'yyyy-MM-dd'));
    } else {
      params.delete('startDate');
    }

    if (end) {
      params.set('endDate', format(end, 'yyyy-MM-dd'));
    } else {
      params.delete('endDate');
    }

    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  };

  const submitPDFRequest = async (opts: PDFOptions) => {
    try {
      setGeneratingPDF(true);

      let startImessageTimestamp: number | null = null;
      let endImessageTimestamp: number | null = null;

      if (startDate) {
        const unixTimestamp = Math.floor(startDate.getTime() / 1000);
        startImessageTimestamp = unixToImessageTimestamp(unixTimestamp);
      }

      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        const unixTimestamp = Math.floor(endOfDay.getTime() / 1000);
        endImessageTimestamp = unixToImessageTimestamp(unixTimestamp);
      }

      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: parseInt(chatId),
          dbPath,
          attachmentsPath,
          contactsPath,
          startDate: startImessageTimestamp,
          endDate: endImessageTimestamp,
          pageSize: opts.pageSize,
          customWidthIn: opts.customWidthIn,
          customHeightIn: opts.customHeightIn,
          marginIn: opts.marginIn,
          columnWidthPx: opts.columnWidthPx,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `imessage-conversation-${chatId}-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setPdfDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-6">
        <h3 className="text-sm font-medium text-red-800">Error</h3>
        <p className="text-sm text-red-600 mt-1">{error}</p>
        <Link
          href="/"
          className="mt-2 inline-block text-sm text-red-600 hover:text-red-800 underline"
        >
          Back to Conversations
        </Link>
      </div>
    );
  }

  const resolvedParticipants = conversationDetails
    ? conversationDetails.participants.map((p) => contacts?.resolve(p) ?? p)
    : [];

  const getConversationName = () => {
    if (!conversationDetails) return `Conversation ${chatId}`;
    if (conversationDetails.display_name) return conversationDetails.display_name;
    if (resolvedParticipants.length === 1) return resolvedParticipants[0];
    if (resolvedParticipants.length > 1) return resolvedParticipants.join(', ');
    return `Conversation ${chatId}`;
  };

  const sidebar = (
    <aside className="w-full lg:w-72 lg:flex-shrink-0 lg:border-r lg:border-gray-200 bg-white lg:h-screen lg:overflow-y-auto">
      <div className="p-4 border-b border-gray-200">
        <Link
          href="/"
          className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center"
        >
          ← All conversations
        </Link>
        <h1 className="text-base font-semibold text-gray-900 leading-tight break-words mt-2">
          {getConversationName()}
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          {totalCount > 0 ? totalCount : messages.length} messages
          {startDate && endDate && (
            <> &middot; {format(startDate, 'MMM d')} – {format(endDate, 'MMM d, yyyy')}</>
          )}
        </p>
      </div>

      {conversationDetails && conversationDetails.participants.length > 0 && (
        <div className="p-4 border-b border-gray-200">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Participants
          </p>
          <ul className="space-y-1.5">
            {conversationDetails.participants.map((raw) => {
              const resolved = contacts?.resolve(raw) ?? null;
              return (
                <li key={raw} className="group flex items-start gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-gray-900">{resolved ?? raw}</span>
                      {contactsPath && (
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <InlineNameEditor handleId={raw} />
                        </span>
                      )}
                    </div>
                    {resolved && (
                      <div className="truncate text-xs text-gray-400 font-mono">{raw}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="p-4 border-b border-gray-200">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Date range
        </p>
        <DateRangePicker
          compact
          onDateRangeChange={handleDateRangeChange}
          initialStartDate={startDate}
          initialEndDate={endDate}
        />
      </div>

      <div className="p-4">
        <button
          onClick={() => setPdfDialogOpen(true)}
          disabled={generatingPDF || messages.length === 0}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
        >
          {generatingPDF ? 'Generating PDF…' : 'Generate PDF'}
        </button>
      </div>
    </aside>
  );

  const isGroup = conversationDetails?.is_group ?? false;

  const messageColumn = (
    <div
      className="mx-auto bg-white flex flex-col h-full w-full shadow-sm relative"
      style={{ maxWidth: `${columnWidth}px` }}
    >
      {/* Drag handle on the right edge — column is centered so width grows symmetrically. */}
      <div
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        title={`${columnWidth}px${currentSnapLabel ? ` — ${currentSnapLabel}` : ''}`}
        className="hidden lg:flex absolute top-0 -right-1 h-full w-2 cursor-col-resize group items-center justify-center z-10 select-none touch-none"
      >
        <div
          className={`h-16 w-[3px] rounded-full transition-colors ${
            isDragging
              ? 'bg-blue-500 opacity-100'
              : 'bg-gray-400 opacity-60 group-hover:bg-blue-500 group-hover:opacity-100'
          }`}
        />
      </div>
      {/* Floating width readout during drag */}
      {isDragging && (
        <div className="hidden lg:block absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">
          {columnWidth}px{currentSnapLabel ? ` · ${currentSnapLabel}` : ''}
        </div>
      )}
      <div id="scrollableDiv" className="flex-1 overflow-y-auto px-3 py-4">
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
            Loading…
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-gray-500 py-12 text-sm">
            No messages found for the selected date range.
          </p>
        ) : (
          <InfiniteScroll
            dataLength={messages.length}
            next={fetchMoreMessages}
            hasMore={hasMore}
            loader={
              <div className="flex items-center justify-center py-4 text-xs text-gray-500">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                Loading more…
              </div>
            }
            endMessage={
              messages.length > 0 ? (
                <p className="text-center py-4 text-xs text-gray-400">
                  All messages loaded ({messages.length} total)
                </p>
              ) : null
            }
            scrollableTarget="scrollableDiv"
          >
            <SwipeForTimestamps>
              <MessageList
                messages={messages}
                isGroup={isGroup}
                dbPath={dbPath}
                attachmentsPath={attachmentsPath}
              />
            </SwipeForTimestamps>
          </InfiniteScroll>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-gray-50">
      {sidebar}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-100">
        {messageColumn}
      </main>
      <PDFOptionsDialog
        open={pdfDialogOpen}
        onOpenChange={(v) => !generatingPDF && setPdfDialogOpen(v)}
        defaultColumnWidthPx={columnWidth}
        onSubmit={submitPDFRequest}
        submitting={generatingPDF}
      />
    </div>
  );
}
