'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import MessageBubble from '@/components/MessageBubble';
import DateRangePicker from '@/components/DateRangePicker';
import InfiniteScroll from 'react-infinite-scroll-component';
import { imessageToDate, isMoreThan5MinutesApart, isDifferentDay } from '@/lib/utils/timestamp';

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
}

interface ConversationDetails {
  chat_id: number;
  display_name: string | null;
  participants: string[];
  is_group: boolean;
}

export default function ConversationPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const chatId = params.id as string;
  const dbPath = searchParams.get('dbPath') || '';
  const attachmentsPath = searchParams.get('attachmentsPath') || '';

  const [messages, setMessages] = useState<MessageWithAttachments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [conversationDetails, setConversationDetails] = useState<ConversationDetails | null>(null);
  const PAGE_SIZE = 500;

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
        url.searchParams.set('startDate', Math.floor(startDate.getTime() / 1000).toString());
      }
      if (endDate) {
        url.searchParams.set('endDate', Math.floor(endDate.getTime() / 1000).toString());
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

  useEffect(() => {
    if (dbPath && attachmentsPath) {
      // Reset to page 1 when date range changes
      setPage(1);
      setHasMore(true);
      fetchMessages(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbPath, attachmentsPath, startDate, endDate]);

  const handleDateRangeChange = (start: Date | null, end: Date | null) => {
    setStartDate(start);
    setEndDate(end);
  };

  const generatePDF = async () => {
    try {
      setGeneratingPDF(true);
      
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: parseInt(chatId),
          dbPath,
          attachmentsPath,
          startDate: startDate ? Math.floor(startDate.getTime() / 1000) : null,
          endDate: endDate ? Math.floor(endDate.getTime() / 1000) : null,
          title: `iMessage Conversation - ${chatId}`,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `imessage-conversation-${chatId}-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading conversation...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
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

  const getConversationName = () => {
    if (!conversationDetails) return `Conversation ${chatId}`;
    
    if (conversationDetails.display_name) {
      return conversationDetails.display_name;
    }
    
    if (conversationDetails.participants.length === 1) {
      return conversationDetails.participants[0];
    }
    
    if (conversationDetails.participants.length > 1) {
      return conversationDetails.participants.join(', ');
    }
    
    return `Conversation ${chatId}`;
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <Link
          href="/"
          className="text-blue-600 hover:text-blue-800 underline"
        >
          ← Back to Conversations
        </Link>
        <button
          onClick={generatePDF}
          disabled={generatingPDF || messages.length === 0}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {generatingPDF ? 'Generating PDF...' : 'Generate PDF'}
        </button>
      </div>

      {/* Date Range Picker */}
      <div className="p-4 bg-white border-b">
        <DateRangePicker onDateRangeChange={handleDateRangeChange} />
      </div>

      {/* Messages */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {getConversationName()}
          </h2>
          <p className="text-sm text-gray-600">
            {totalCount > 0 ? totalCount : messages.length} messages
            {startDate && endDate && (
              <span>
                {' '}from {format(startDate, 'MMM d, yyyy')} to {format(endDate, 'MMM d, yyyy')}
              </span>
            )}
          </p>
        </div>
        
        <div id="scrollableDiv" className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && !loading ? (
            <p className="text-center text-gray-500 py-8">
              No messages found for the selected date range.
            </p>
          ) : (
            <InfiniteScroll
              dataLength={messages.length}
              next={fetchMoreMessages}
              hasMore={hasMore}
              loader={
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-sm text-gray-600">Loading more messages...</span>
                </div>
              }
              endMessage={
                messages.length > 0 ? (
                  <p className="text-center py-4 text-sm text-gray-500">
                    All messages loaded ({messages.length} total)
                  </p>
                ) : null
              }
              scrollableTarget="scrollableDiv"
            >
              <div className="space-y-1">
                {messages.map((messageData, index) => {
                  const prevMessage = index > 0 ? messages[index - 1].message : null;
                  const currentMessage = messageData.message;
                  
                  // Determine if we should show timestamp (first message or 5+ minutes apart)
                  const showTimestamp = 
                    index === 0 || 
                    (prevMessage && isMoreThan5MinutesApart(prevMessage.date, currentMessage.date));
                  
                  // Determine if we should show date separator (different day)
                  const showDateSeparator = 
                    index === 0 || 
                    (prevMessage && isDifferentDay(prevMessage.date, currentMessage.date));
                  
                  const currentDate = imessageToDate(currentMessage.date);
                  
                  return (
                    <div key={messageData.message.ROWID}>
                      {/* Date separator */}
                      {showDateSeparator && (
                        <div className="flex items-center justify-center my-6">
                          <div className="bg-gray-200 rounded-full px-4 py-1">
                            <span className="text-xs font-medium text-gray-600">
                              {format(currentDate, 'EEEE, MMMM d, yyyy')}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {/* Message bubble */}
                      <MessageBubble
                        message={messageData.message}
                        handle={messageData.handle}
                        attachments={messageData.attachments}
                        dbPath={dbPath}
                        attachmentsPath={attachmentsPath}
                        showTimestamp={showTimestamp}
                      />
                    </div>
                  );
                })}
              </div>
            </InfiniteScroll>
          )}
        </div>
      </div>
    </div>
  );
}
