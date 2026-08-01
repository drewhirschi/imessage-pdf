'use client';

import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import DateRangePicker from '@/components/DateRangePicker';
import InfiniteScroll from 'react-infinite-scroll-component';
import MessageList from '@/components/MessageList';
import PDFOptionsDialog, { type PDFOptions, type PDFProgress } from '@/components/PDFOptionsDialog';
import { unixToImessageTimestamp } from '@/lib/utils/timestamp';
import { ContactsProvider, useContactsOptional } from '@/components/ContactsProvider';
import InlineNameEditor from '@/components/InlineNameEditor';
import SwipeForTimestamps from '@/components/SwipeForTimestamps';
import type { Reaction } from '@/lib/db/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConversationHistory from '@/components/ConversationHistory';
import type { ConversationAvailability } from '@/lib/db/types';

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
const SCREEN_SIZE_STORAGE_KEY = 'imessage-screen-size';
const QR_PREVIEW_STORAGE_KEY = 'imessage-preview-qr-codes';
const START_POSITION_STORAGE_KEY = 'imessage-start-position';
const SNAP_POINTS: { width: number; label: string }[] = [
  { width: 375, label: 'iPhone SE' },
  { width: 390, label: 'iPhone 12 / 13 / 14' },
  { width: 393, label: 'iPhone 14 / 15 Pro' },
  { width: 430, label: 'iPhone Pro Max' },
];

export default function ConversationPage() {
  return (
    <ContactsProvider>
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
  const [pdfProgress, setPdfProgress] = useState<PDFProgress | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [conversationDetails, setConversationDetails] = useState<ConversationDetails | null>(null);
  const [conversationAvailability, setConversationAvailability] = useState<ConversationAvailability | null>(null);
  const [columnWidth, setColumnWidth] = useState<number>(DEFAULT_COLUMN_WIDTH);
  const [screenSize, setScreenSize] = useState<string>(
    String(DEFAULT_COLUMN_WIDTH),
  );
  const [previewQrCodes, setPreviewQrCodes] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [startPosition, setStartPosition] = useState<'latest' | 'earliest'>('latest');
  const [loadingMore, setLoadingMore] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const fetchingRef = useRef(false);
  const requestIdRef = useRef(0);
  const pendingScrollHeightRef = useRef<number | null>(null);
  const scrollToBottomRef = useRef(false);
  const PAGE_SIZE = 500;

  useEffect(() => {
    const bridge = (window as unknown as {
      electron?: { onPDFProgress?: (callback: (progress: PDFProgress) => void) => () => void };
    }).electron;
    return bridge?.onPDFProgress?.((progress) => setPdfProgress(progress));
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(COLUMN_WIDTH_STORAGE_KEY);
    const savedScreenSize = localStorage.getItem(SCREEN_SIZE_STORAGE_KEY);
    setPreviewQrCodes(localStorage.getItem(QR_PREVIEW_STORAGE_KEY) === 'true');
    const savedStart = localStorage.getItem(START_POSITION_STORAGE_KEY);
    if (savedStart === 'earliest' || savedStart === 'latest') {
      setStartPosition(savedStart);
    }
    if (saved) {
      const n = parseInt(saved, 10);
      if (!Number.isNaN(n) && n >= MIN_COLUMN_WIDTH && n <= MAX_COLUMN_WIDTH) {
        setColumnWidth(n);
        const isPreset = SNAP_POINTS.some((point) => point.width === n);
        setScreenSize(
          savedScreenSize === 'custom' || !isPreset ? 'custom' : String(n),
        );
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(COLUMN_WIDTH_STORAGE_KEY, String(columnWidth));
  }, [columnWidth]);

  useEffect(() => {
    localStorage.setItem(SCREEN_SIZE_STORAGE_KEY, screenSize);
  }, [screenSize]);

  useEffect(() => {
    localStorage.setItem(QR_PREVIEW_STORAGE_KEY, String(previewQrCodes));
  }, [previewQrCodes]);

  useEffect(() => {
    localStorage.setItem(START_POSITION_STORAGE_KEY, startPosition);
  }, [startPosition]);

  const handleScreenSizeChange = (value: string) => {
    setScreenSize(value);
    if (value === 'custom') return;
    setColumnWidth(Number(value));
  };

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
    setColumnWidth(raw);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
  };

  const fetchMessages = useCallback(async (pageNum: number, reset: boolean = false) => {
    if (!reset && fetchingRef.current) return;
    const requestId = ++requestIdRef.current;
    fetchingRef.current = true;
    try {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
        if (startPosition === 'latest') {
          const scroller = document.getElementById('scrollableDiv');
          pendingScrollHeightRef.current = scroller?.scrollHeight ?? null;
        }
      }
      setError(null);

      const url = new URL('/api/messages', window.location.origin);
      url.searchParams.set('chatId', chatId);
      url.searchParams.set('dbPath', dbPath);
      url.searchParams.set('page', pageNum.toString());
      url.searchParams.set('limit', PAGE_SIZE.toString());
      url.searchParams.set('getDetails', pageNum === 1 ? 'true' : 'false');
      url.searchParams.set('direction', startPosition);
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
      if (requestId !== requestIdRef.current) return;

      if (reset) {
        setMessages(data.messages);
        scrollToBottomRef.current = startPosition === 'latest';
      } else if (startPosition === 'latest') {
        setMessages(prev => [...data.messages, ...prev]);
      } else {
        setMessages(prev => [...prev, ...data.messages]);
      }

      setHasMore(data.hasMore);
      setTotalCount(data.total);
      setPage(pageNum);

      if (data.conversationDetails) {
        setConversationDetails(data.conversationDetails);
      }
      if (data.conversationAvailability) {
        setConversationAvailability(data.conversationAvailability);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      if (requestId === requestIdRef.current) {
        fetchingRef.current = false;
        setLoadingMore(false);
      }
      if (reset && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [chatId, dbPath, startDate, endDate, startPosition, PAGE_SIZE]);

  const fetchMoreMessages = useCallback(() => {
    if (!loading && !loadingMore && hasMore) {
      fetchMessages(page + 1, false);
    }
  }, [page, loading, loadingMore, hasMore, fetchMessages]);

  const fetchMessagesRef = useCallback(fetchMessages, [fetchMessages]);

  useEffect(() => {
    if (dbPath && attachmentsPath) {
      setPage(1);
      setHasMore(true);
      fetchMessagesRef(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbPath, attachmentsPath, startDate, endDate, startPosition]);

  useLayoutEffect(() => {
    const scroller = document.getElementById('scrollableDiv');
    if (!scroller) return;
    if (scrollToBottomRef.current) {
      scroller.scrollTop = scroller.scrollHeight;
      scrollToBottomRef.current = false;
      return;
    }
    if (pendingScrollHeightRef.current != null) {
      scroller.scrollTop += scroller.scrollHeight - pendingScrollHeightRef.current;
      pendingScrollHeightRef.current = null;
    }
  }, [messages]);

  const handleMessageScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (startPosition === 'latest' && event.currentTarget.scrollTop < 500) {
      fetchMoreMessages();
    }
  }, [startPosition, fetchMoreMessages]);

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
      setPdfError(null);
      setPdfProgress({ percent: 1, stage: 'Starting export', detail: 'Preparing the local print renderer…' });

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

      const requestBody = {
        chatId: parseInt(chatId),
        dbPath,
        attachmentsPath,
        startDate: startImessageTimestamp,
        endDate: endImessageTimestamp,
        pageSize: opts.pageSize,
        customWidthIn: opts.customWidthIn,
        customHeightIn: opts.customHeightIn,
        marginIn: opts.marginIn,
        columnWidthPx: opts.columnWidthPx,
      };

      // In the packaged Electron app, render + save natively (printToPDF +
      // OS save dialog) instead of streaming a blob download. The puppeteer
      // HTTP route stays the fallback for the browser dev flow.
      const bridge = (window as unknown as { electron?: { exportPDF?: (b: unknown) => Promise<{ filePath?: string; canceled?: boolean; error?: string }> } }).electron;
      if (bridge?.exportPDF) {
        const result = await bridge.exportPDF(requestBody);
        if (result?.error) {
          throw new Error(result.error);
        }
        // result.canceled → user dismissed the save dialog; treat as a no-op.
        setPdfDialogOpen(false);
        return;
      }

      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      setPdfProgress({ percent: 90, stage: 'Downloading PDF', detail: 'The browser renderer finished; preparing the file…' });
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
      const message = err instanceof Error ? err.message : 'Failed to generate PDF';
      setPdfError(message);
      setPdfProgress({ percent: 0, stage: 'Export failed', detail: message, error: true });
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

  const unresolvedCount = conversationDetails
    ? conversationDetails.participants.filter((p) => !contacts?.resolve(p)).length
    : 0;

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
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center"
          >
            ← All conversations
          </Link>
          <Link
            href={`/contacts?dbPath=${encodeURIComponent(dbPath)}`}
            className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center"
          >
            Contacts
          </Link>
        </div>
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

      <Tabs defaultValue="settings">
        <div className="border-b border-gray-200 px-4 py-3">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="settings" className="text-xs">Settings</TabsTrigger>
            <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="settings" className="m-0">
          {conversationDetails && conversationDetails.participants.length > 0 && (
            <div className="border-b border-gray-200 p-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Participants
              </p>
              {unresolvedCount > 0 && (
                <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                  {unresolvedCount} unnamed contact{unresolvedCount === 1 ? '' : 's'} in
                  this chat — click the ✎ to name {unresolvedCount === 1 ? 'it' : 'them'}.
                </div>
              )}
              <ul className="space-y-1.5">
                {conversationDetails.participants.map((raw) => {
                  const resolved = contacts?.resolve(raw) ?? null;
                  return (
                    <li key={raw} className="group flex items-start gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-gray-900">{resolved ?? raw}</span>
                          <span className={resolved ? 'opacity-0 transition-opacity group-hover:opacity-100' : 'opacity-100'}>
                            <InlineNameEditor handleId={raw} />
                          </span>
                        </div>
                        {resolved && <div className="truncate font-mono text-xs text-gray-400">{raw}</div>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="border-b border-gray-200 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">iPhone width</p>
              <span className="text-[10px] tabular-nums text-gray-400">{columnWidth}px</span>
            </div>
            <Select value={screenSize} onValueChange={handleScreenSizeChange}>
              <SelectTrigger className="h-9 bg-white text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SNAP_POINTS.map((point) => (
                  <SelectItem key={point.width} value={String(point.width)}>
                    {point.label} ({point.width}px)
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-4">
            <label htmlFor="preview-qr-codes" className="text-xs font-medium text-gray-700">Preview QR codes</label>
            <Switch id="preview-qr-codes" checked={previewQrCodes} onCheckedChange={setPreviewQrCodes} />
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-4">
            <div>
              <label htmlFor="open-at-latest" className="text-xs font-medium text-gray-800">
                Open at latest
              </label>
              <p className="text-[10px] text-gray-500">
                {startPosition === 'latest' ? 'Newest messages at the bottom' : 'Start at the first message'}
              </p>
            </div>
            <Switch
              id="open-at-latest"
              checked={startPosition === 'latest'}
              onCheckedChange={(checked) => setStartPosition(checked ? 'latest' : 'earliest')}
            />
          </div>

          <div className="border-b border-gray-200 p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Date range</p>
            <DateRangePicker
              compact
              onDateRangeChange={handleDateRangeChange}
              initialStartDate={startDate}
              initialEndDate={endDate}
            />
          </div>

          <div className="p-4">
            <button
              onClick={() => {
                setPdfError(null);
                setPdfProgress(null);
                setPdfDialogOpen(true);
              }}
              disabled={generatingPDF || messages.length === 0}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {generatingPDF ? 'Generating PDF…' : 'Generate PDF'}
            </button>
          </div>
        </TabsContent>

        <TabsContent value="history" className="m-0">
          {conversationAvailability && (
            <ConversationHistory availability={conversationAvailability} />
          )}
        </TabsContent>
      </Tabs>
    </aside>
  );

  const isGroup = conversationDetails?.is_group ?? false;

  const messageColumn = (
    <div
      className="mx-auto bg-white flex flex-col h-full w-full shadow-sm relative"
      style={{ maxWidth: `${columnWidth}px` }}
    >
      {/* Custom mode exposes a persistent resize rail on the column edge. */}
      {screenSize === 'custom' && (
        <div
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title={`Resize custom screen (${columnWidth}px)`}
          className="group absolute -right-2 top-0 z-10 hidden h-full w-4 cursor-col-resize touch-none select-none items-center justify-center lg:flex"
        >
          <div
            className={`h-full w-px transition-colors ${
              isDragging ? 'bg-blue-500' : 'bg-blue-300 group-hover:bg-blue-500'
            }`}
          />
          <div
            className={`absolute h-20 w-1 rounded-full shadow-sm transition-colors ${
              isDragging ? 'bg-blue-600' : 'bg-blue-500 group-hover:bg-blue-600'
            }`}
          />
        </div>
      )}
      {/* Floating width readout during drag */}
      {isDragging && (
        <div className="hidden lg:block absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">
          {columnWidth}px
        </div>
      )}
      <div
        id="scrollableDiv"
        onScroll={handleMessageScroll}
        className="flex-1 overflow-y-auto px-3 py-4"
      >
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
          startPosition === 'latest' ? (
            <>
              <div className="flex min-h-8 items-center justify-center py-2 text-xs text-gray-400">
                {loadingMore
                  ? 'Loading earlier messages…'
                  : hasMore
                    ? 'Scroll up for earlier messages'
                    : `Beginning of conversation (${messages.length} loaded)`}
              </div>
              <SwipeForTimestamps>
                <MessageList
                  messages={messages}
                  isGroup={isGroup}
                  dbPath={dbPath}
                  attachmentsPath={attachmentsPath}
                  forPrint={previewQrCodes}
                />
              </SwipeForTimestamps>
            </>
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
                forPrint={previewQrCodes}
              />
            </SwipeForTimestamps>
          </InfiniteScroll>
          )
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
        progress={pdfProgress}
        error={pdfError}
        totalMessages={totalCount}
      />
    </div>
  );
}
