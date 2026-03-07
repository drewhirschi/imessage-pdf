'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import MessageBubble from '@/components/MessageBubble';
import DateRangePicker from '@/components/DateRangePicker';
import InfiniteScroll from 'react-infinite-scroll-component';
import { imessageToDate, isMoreThan5MinutesApart, isDifferentDay, unixToImessageTimestamp } from '@/lib/utils/timestamp';

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

interface Reaction {
  ROWID: number;
  associated_message_type: number;
  handle_id: number | null;
  is_from_me: number;
  date: number;
  sender_id: string | null;
  reaction_type: string;
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

export default function ConversationPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const chatId = params.id as string;
  const dbPath = searchParams.get('dbPath') || '';
  const attachmentsPath = searchParams.get('attachmentsPath') || '';

  // Initialize dates from URL parameters
  const getInitialDateFromURL = (paramName: string): Date | null => {
    const dateString = searchParams.get(paramName);
    if (!dateString) return null;
    
    try {
      // Parse YYYY-MM-DD format from URL
      const date = new Date(dateString + 'T00:00:00');
      // Validate the date
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
        // Convert JavaScript Date to Unix timestamp (seconds), then to iMessage timestamp (nanoseconds since 2001)
        const unixTimestamp = Math.floor(startDate.getTime() / 1000);
        const imessageTimestamp = unixToImessageTimestamp(unixTimestamp);
        url.searchParams.set('startDate', imessageTimestamp.toString());
      }
      if (endDate) {
        // Convert JavaScript Date to Unix timestamp (seconds), then to iMessage timestamp (nanoseconds since 2001)
        // For end date, we want to include the entire day, so set to end of day
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
    
    // Update URL with date filters
    const params = new URLSearchParams(window.location.search);
    
    if (start) {
      // Format as YYYY-MM-DD
      const startString = format(start, 'yyyy-MM-dd');
      params.set('startDate', startString);
    } else {
      params.delete('startDate');
    }
    
    if (end) {
      // Format as YYYY-MM-DD
      const endString = format(end, 'yyyy-MM-dd');
      params.set('endDate', endString);
    } else {
      params.delete('endDate');
    }
    
    // Replace URL without adding to history
    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  };

  const generatePDF = async () => {
    try {
      setGeneratingPDF(true);
      
      // Convert dates to iMessage timestamps for the API
      let startImessageTimestamp = null;
      let endImessageTimestamp = null;
      
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: parseInt(chatId),
          dbPath,
          attachmentsPath,
          startDate: startImessageTimestamp,
          endDate: endImessageTimestamp,
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
        <DateRangePicker 
          onDateRangeChange={handleDateRangeChange}
          initialStartDate={startDate}
          initialEndDate={endDate}
        />
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
                        reactions={messageData.reactions}
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
