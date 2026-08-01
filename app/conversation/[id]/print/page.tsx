'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import MessageList, { type MessageWithAttachments } from '@/components/MessageList';
import { ContactsProvider } from '@/components/ContactsProvider';

interface ConversationDetails {
  chat_id: number;
  display_name: string | null;
  participants: string[];
  is_group: boolean;
}

const FETCH_PAGE_SIZE = 500;

// A static, scroll-free render of the conversation used as the source HTML for
// Puppeteer's print-to-PDF. Reuses MessageList so visual output matches the
// live viewer 1:1.
export default function PrintPage() {
  return (
    <ContactsProvider>
      <PrintPageInner />
    </ContactsProvider>
  );
}

function PrintPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const chatId = params.id as string;
  const dbPath = searchParams.get('dbPath') || '';
  const attachmentsPath = searchParams.get('attachmentsPath') || '';
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  const columnWidth = parseInt(searchParams.get('columnWidth') || '430', 10);

  const [messages, setMessages] = useState<MessageWithAttachments[]>([]);
  const [details, setDetails] = useState<ConversationDetails | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const all: MessageWithAttachments[] = [];
      let page = 1;
      let hasMore = true;
      let gotDetails = false;

      while (hasMore) {
        const url = new URL('/api/messages', window.location.origin);
        url.searchParams.set('chatId', chatId);
        url.searchParams.set('dbPath', dbPath);
        url.searchParams.set('page', String(page));
        url.searchParams.set('limit', String(FETCH_PAGE_SIZE));
        url.searchParams.set('getDetails', gotDetails ? 'false' : 'true');
        if (startDate) url.searchParams.set('startDate', startDate);
        if (endDate) url.searchParams.set('endDate', endDate);

        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        const data = await res.json();

        all.push(...(data.messages as MessageWithAttachments[]));
        document.documentElement.setAttribute('data-export-loaded', String(all.length));
        document.documentElement.setAttribute('data-export-total', String(data.total ?? all.length));
        hasMore = !!data.hasMore;
        page += 1;

        if (!gotDetails && data.conversationDetails) {
          setDetails(data.conversationDetails);
          gotDetails = true;
        }
      }

      setMessages(all);
      setReady(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed';
      document.documentElement.setAttribute('data-export-error', message);
      setError(message);
      setReady(true);
    }
  }, [chatId, dbPath, startDate, endDate]);

  useEffect(() => {
    if (!dbPath) return;
    fetchAll();
  }, [dbPath, fetchAll]);

  // Signal readiness for Puppeteer. It polls this attribute.
  useEffect(() => {
    if (!ready) return;
    if (typeof document === 'undefined') return;

    // Give images a frame to mount, then wait for them to decode.
    const check = async () => {
      const imgs = Array.from(document.querySelectorAll('img'));
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          });
        }),
      );
      document.documentElement.setAttribute('data-print-ready', '1');
    };
    const raf = requestAnimationFrame(() => {
      check();
    });
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  if (error) {
    return <div style={{ padding: 32, color: '#b91c1c' }}>{error}</div>;
  }

  const isGroup = details?.is_group ?? false;

  return (
    <div
      className="bg-white mx-auto"
      style={{ maxWidth: `${columnWidth}px` }}
    >
      <div className="px-3 py-4">
        {/* Inner overflow-x-hidden matches the live view's
            SwipeForTimestamps clip: it sits inside the padded column so
            the clip happens at the content edge, hiding swipe-revealed
            per-message timestamps that sit at right:-58px. */}
        <div className="overflow-x-hidden">
          {!ready ? (
            <div className="text-sm text-gray-500 py-12 text-center">Loading…</div>
          ) : (
            <MessageList
              messages={messages}
              isGroup={isGroup}
              dbPath={dbPath}
              attachmentsPath={attachmentsPath}
              forPrint
            />
          )}
        </div>
      </div>
    </div>
  );
}
