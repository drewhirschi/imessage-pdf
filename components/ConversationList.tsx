'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, MessageSquare, Pin, Search, Users, X } from 'lucide-react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { imessageToDate, formatRelativeTime } from '@/lib/utils/timestamp';
import { useContactsOptional } from './ContactsProvider';

interface Conversation {
  chat_id: number;
  chat_identifier: string;
  display_name: string | null;
  participants: string[];
  last_message: string | null;
  last_message_date: number | null;
  message_count: number;
  is_group: boolean;
  is_pinned: boolean;
}

interface ConversationListProps {
  dbPath: string;
  attachmentsPath: string;
}

export default function ConversationList({ dbPath, attachmentsPath }: ConversationListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contacts = useContactsOptional();
  const contactEntries = useMemo(() => contacts?.entries ?? {}, [contacts?.entries]);
  
  // Initialize filterText from URL params
  const [filterText, setFilterText] = useState(searchParams.get('phoneNumber') || '');
  const [debouncedFilterText, setDebouncedFilterText] = useState(filterText);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [pinning, setPinning] = useState<Set<string>>(new Set());
  const PAGE_SIZE = 50;

  const fetchConversations = useCallback(async (pageNum: number, reset: boolean = false) => {
    try {
      if (reset) {
        setLoading(true);
      }
      setError(null);

      const url = new URL('/api/conversations', window.location.origin);
      url.searchParams.set('dbPath', dbPath);
      url.searchParams.set('page', pageNum.toString());
      url.searchParams.set('limit', PAGE_SIZE.toString());
      const q = debouncedFilterText.trim();
      if (q) {
        url.searchParams.set('phoneNumber', q);
        const qLower = q.toLowerCase();
        const nameMatches = Object.entries(contactEntries)
          .filter(([, c]) => c?.name && c.name.toLowerCase().includes(qLower))
          .map(([id]) => id);
        if (nameMatches.length > 0) {
          url.searchParams.set('handleIds', nameMatches.join(','));
        }
      }
      
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }
      
      const data = await response.json();
      
      if (reset) {
        setConversations(data.conversations);
      } else {
        setConversations(prev => [...prev, ...data.conversations]);
      }
      
      setHasMore(data.hasMore);
      setTotalCount(data.total);
      setPage(pageNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      if (reset) {
        setLoading(false);
      }
    }
  }, [dbPath, debouncedFilterText, PAGE_SIZE, contactEntries]);

  const fetchMoreConversations = useCallback(() => {
    if (!loading && hasMore) {
      fetchConversations(page + 1, false);
    }
  }, [page, loading, hasMore, fetchConversations]);

  // Debounce the filter text (500ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilterText(filterText);
    }, 500);

    return () => clearTimeout(timer);
  }, [filterText]);

  // Update URL when debounced filter text changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    if (debouncedFilterText.trim()) {
      params.set('phoneNumber', debouncedFilterText.trim());
    } else {
      params.delete('phoneNumber');
    }
    
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    router.replace(newUrl, { scroll: false });
  }, [debouncedFilterText, router]);

  useEffect(() => {
    if (dbPath && attachmentsPath) {
      setPage(1);
      setHasMore(true);
      fetchConversations(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbPath, attachmentsPath, debouncedFilterText, contacts?.loaded]);

  const formatLastMessage = (message: string | null) => {
    if (!message) return 'No messages';
    const cleaned = message.replace(/\uFFFC/g, '').trim();
    if (!cleaned) return 'Attachment';
    return cleaned.length > 50 ? cleaned.substring(0, 50) + '...' : cleaned;
  };

  const formatLastMessageDate = (timestamp: number | null) => {
    if (!timestamp) return '';
    const date = imessageToDate(timestamp);
    return formatRelativeTime(date);
  };

  const togglePin = async (conversation: Conversation) => {
    const chatIdentifier = conversation.chat_identifier;
    const pinned = !conversation.is_pinned;
    const previous = conversations;
    setPinning((current) => new Set(current).add(chatIdentifier));
    setConversations((current) =>
      current
        .map((item) =>
          item.chat_identifier === chatIdentifier
            ? { ...item, is_pinned: pinned }
            : item,
        )
        .sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
          return (b.last_message_date ?? 0) - (a.last_message_date ?? 0);
        }),
    );

    try {
      const response = await fetch('/api/conversation-pins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbPath, chatIdentifier, pinned }),
      });
      if (!response.ok) throw new Error('Failed to update pin');
    } catch (err) {
      setConversations(previous);
      setError(err instanceof Error ? err.message : 'Failed to update pin');
    } finally {
      setPinning((current) => {
        const next = new Set(current);
        next.delete(chatIdentifier);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="overflow-hidden rounded-md border border-[#dfe2e5] bg-white">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="flex h-[76px] animate-pulse items-center gap-3 border-b border-[#eceeef] px-4 last:border-0">
            <div className="size-10 rounded-full bg-[#edf0f2]" />
            <div className="flex-1">
              <div className="h-3.5 w-36 rounded bg-[#e7e9eb]" />
              <div className="mt-2 h-3 w-2/3 rounded bg-[#f0f1f2]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4">
        <h3 className="text-sm font-medium text-red-800">Error Loading Conversations</h3>
        <p className="text-sm text-red-600 mt-1">{error}</p>
        <button
          onClick={() => fetchConversations(1, true)}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (conversations.length === 0 && !filterText) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No conversations found.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="relative max-w-2xl flex-1">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="size-4 text-[#81868b]" />
        </div>
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Search names, numbers, or messages"
          className="block h-9 w-full rounded-md border border-[#cfd3d7] bg-white pl-9 pr-9 text-sm text-[#303236] outline-none transition focus:border-[#1473e6] focus:ring-2 focus:ring-[#1473e6]/15"
        />
        {filterText && (
          <button
            onClick={() => setFilterText('')}
            aria-label="Clear search"
            className="absolute inset-y-0 right-0 flex items-center pr-3 hover:text-gray-700"
          >
            <X className="size-4 text-gray-400 hover:text-gray-600" />
          </button>
        )}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-[#777c82]">
          {totalCount > 0 ? totalCount.toLocaleString() : conversations.length.toLocaleString()}
          {filterText ? ' matches' : ' threads'}
        </span>
      </div>

      {conversations.length === 0 && filterText && !loading ? (
        <div className="rounded-md border border-[#dfe2e5] bg-white py-14 text-center">
          <p className="text-gray-500">No conversations match your filter.</p>
          <button
            onClick={() => setFilterText('')}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Clear filter
          </button>
        </div>
      ) : (
        <InfiniteScroll
          dataLength={conversations.length}
          next={fetchMoreConversations}
          hasMore={hasMore}
          loader={
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-sm text-gray-600">Loading more...</span>
            </div>
          }
          endMessage={
            conversations.length > 0 ? (
              <p className="text-center py-4 text-sm text-gray-500">
                All conversations loaded ({conversations.length} total)
              </p>
            ) : null
          }
        >
          <div className="overflow-hidden rounded-md border border-[#dfe2e5] bg-white shadow-[0_1px_2px_rgba(32,33,36,0.04)]">
            {conversations.map((conversation) => {
              const resolvedParticipants = conversation.participants.map(
                (p) => contacts?.resolve(p) ?? p,
              );
              const primary =
                conversation.display_name ||
                (conversation.participants.length === 1
                  ? resolvedParticipants[0]
                  : resolvedParticipants.join(', ')) ||
                conversation.chat_identifier;
              const href = new URLSearchParams({
                dbPath,
                attachmentsPath,
              });
              return (
                <div
                  key={conversation.chat_id}
                  className="group relative border-b border-[#eceeef] last:border-0 hover:bg-[#f7f9fb]"
                >
                  <Link
                    href={`/conversation/${conversation.chat_id}?${href.toString()}`}
                    className="flex min-h-[76px] items-center gap-3 px-4 py-3 pr-14 transition-colors"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#edf3fa] text-[#1473e6]">
                      {conversation.is_group ? (
                        <Users className="size-[18px]" />
                      ) : (
                        <MessageSquare className="size-[18px]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-[#292b2e]">
                            {primary}
                          </h3>
                          {conversation.is_group && (
                            <span className="inline-flex shrink-0 items-center rounded bg-[#f0f1f2] px-1.5 py-0.5 text-[10px] font-medium text-[#656a70]">
                              Group
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-[#777c82]">
                          {formatLastMessageDate(conversation.last_message_date)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-5">
                        <p className="truncate text-sm text-[#6c7177]">
                          {formatLastMessage(conversation.last_message)}
                        </p>
                        <div className="flex shrink-0 items-center gap-3 text-[11px] tabular-nums text-[#969a9e]">
                          <span>{conversation.message_count.toLocaleString()} messages</span>
                          <ChevronRight className="size-4 text-[#b0b4b8] transition-transform group-hover:translate-x-0.5 group-hover:text-[#1473e6]" />
                        </div>
                      </div>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => togglePin(conversation)}
                    disabled={pinning.has(conversation.chat_identifier)}
                    title={conversation.is_pinned ? 'Unpin conversation' : 'Pin conversation'}
                    aria-label={conversation.is_pinned ? `Unpin ${primary}` : `Pin ${primary}`}
                    aria-pressed={conversation.is_pinned}
                    className={`absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md transition ${
                      conversation.is_pinned
                        ? 'text-[#1473e6] opacity-100'
                        : 'text-[#8a8f94] opacity-0 hover:bg-[#e9edf2] hover:text-[#1473e6] focus-visible:opacity-100 group-hover:opacity-100'
                    } disabled:opacity-40`}
                  >
                    <Pin
                      className="size-4"
                      fill={conversation.is_pinned ? 'currentColor' : 'none'}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </InfiniteScroll>
      )}
    </div>
  );
}
