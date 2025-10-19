'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { imessageToDate, formatRelativeTime } from '@/lib/utils/timestamp';

interface Conversation {
  chat_id: number;
  chat_identifier: string;
  display_name: string | null;
  participants: string[];
  last_message: string | null;
  last_message_date: number | null;
  message_count: number;
  is_group: boolean;
}

interface ConversationListProps {
  dbPath: string;
  attachmentsPath: string;
}

export default function ConversationList({ dbPath, attachmentsPath }: ConversationListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Initialize filterText from URL params
  const [filterText, setFilterText] = useState(searchParams.get('phoneNumber') || '');
  const [debouncedFilterText, setDebouncedFilterText] = useState(filterText);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
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
      if (debouncedFilterText.trim()) {
        url.searchParams.set('phoneNumber', debouncedFilterText.trim());
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
  }, [dbPath, debouncedFilterText, PAGE_SIZE]);

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
      // Reset to page 1 when filter changes
      setPage(1);
      setHasMore(true);
      fetchConversations(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbPath, attachmentsPath, debouncedFilterText]);

  const formatLastMessage = (message: string | null) => {
    if (!message) return 'No messages';
    return message.length > 50 ? message.substring(0, 50) + '...' : message;
  };

  const formatLastMessageDate = (timestamp: number | null) => {
    if (!timestamp) return '';
    const date = imessageToDate(timestamp);
    return formatRelativeTime(date);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading conversations...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
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

  if (conversations.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No conversations found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">
        Your Conversations ({totalCount > 0 ? totalCount : conversations.length}{filterText ? ' filtered' : ''})
      </h2>

      {/* Filter Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter by phone number..."
          className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
        {filterText && (
          <button
            onClick={() => setFilterText('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center hover:text-gray-700"
          >
            <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>

      {/* Conversation List */}
      {conversations.length === 0 && filterText && !loading ? (
        <div className="text-center py-8">
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
          <div className="space-y-2">
            {conversations.map((conversation) => (
          <Link
            key={conversation.chat_id}
            href={`/conversation/${conversation.chat_id}?dbPath=${encodeURIComponent(dbPath)}&attachmentsPath=${encodeURIComponent(attachmentsPath)}`}
            className="block bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {conversation.display_name || conversation.chat_identifier}
                  </h3>
                  {conversation.is_group && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      Group
                    </span>
                  )}
                </div>
                
                <p className="text-sm text-gray-600 mt-1">
                  {conversation.participants.length > 1 
                    ? `${conversation.participants.length} participants`
                    : conversation.participants[0] || 'Unknown'
                  }
                </p>
                
                <p className="text-sm text-gray-500 mt-1 truncate">
                  {formatLastMessage(conversation.last_message)}
                </p>
              </div>
              
              <div className="flex flex-col items-end space-y-1 ml-4">
                <span className="text-xs text-gray-500">
                  {formatLastMessageDate(conversation.last_message_date)}
                </span>
                <span className="text-xs text-gray-400">
                  {conversation.message_count} messages
                </span>
              </div>
            </div>
          </Link>
        ))}
          </div>
        </InfiniteScroll>
      )}
    </div>
  );
}
