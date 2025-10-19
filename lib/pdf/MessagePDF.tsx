import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { styles } from './styles';
import { imessageToDate } from '../utils/timestamp';

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

interface MessagePDFProps {
  title: string;
  participants: string[];
  messages: MessageWithAttachments[];
  startDate?: number;
  endDate?: number;
}

export default function MessagePDF({ 
  title, 
  participants, 
  messages, 
  startDate, 
  endDate 
}: MessagePDFProps) {
  const formatDate = (timestamp: number) => {
    return format(imessageToDate(timestamp), 'MMM d, yyyy h:mm a');
  };

  const formatDateOnly = (timestamp: number) => {
    return format(imessageToDate(timestamp), 'EEEE, MMMM d, yyyy');
  };

  const getDateRangeText = () => {
    if (startDate && endDate) {
      return `${format(imessageToDate(startDate), 'MMM d, yyyy')} - ${format(imessageToDate(endDate), 'MMM d, yyyy')}`;
    } else if (startDate) {
      return `From ${format(imessageToDate(startDate), 'MMM d, yyyy')}`;
    } else if (endDate) {
      return `Until ${format(imessageToDate(endDate), 'MMM d, yyyy')}`;
    }
    return 'All messages';
  };

  // Group messages by date for better organization
  const messagesByDate = messages.reduce((acc, messageData) => {
    const date = formatDateOnly(messageData.message.date);
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(messageData);
    return acc;
  }, {} as Record<string, MessageWithAttachments[]>);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Participants: {participants.join(', ')}</Text>
          <Text style={styles.subtitle}>Date Range: {getDateRangeText()}</Text>
          <Text style={styles.subtitle}>Total Messages: {messages.length}</Text>
        </View>

        {/* Messages */}
        {Object.entries(messagesByDate).map(([date, dateMessages]) => (
          <View key={date}>
            {/* Date separator */}
            <Text style={styles.dateSeparator}>{date}</Text>
            
            {dateMessages.map((messageData) => {
              const { message, handle, attachments } = messageData;
              const isFromMe = message.is_from_me === 1;
              const sender = isFromMe ? 'You' : (handle?.id || 'Unknown');
              
              return (
                <View key={message.ROWID} style={styles.messageContainer}>
                  {/* Message bubble */}
                  <View style={[
                    styles.messageBubble,
                    isFromMe ? styles.sentMessage : styles.receivedMessage
                  ]}>
                    {/* Message text */}
                    {message.text && (
                      <Text style={styles.messageText}>{message.text}</Text>
                    )}
                    
                    {/* Attachments */}
                    {attachments.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        {attachments.map((attachment) => (
                          <View key={attachment.ROWID} style={styles.attachment}>
                            {attachment.mime_type?.startsWith('image/') ? (
                              <View style={styles.imagePlaceholder}>
                                <Text style={styles.imageText}>
                                  📷 {attachment.filename || 'Image'}
                                </Text>
                              </View>
                            ) : (
                              <Text style={styles.imageText}>
                                📎 {attachment.filename || 'Attachment'}
                              </Text>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  
                  {/* Timestamp and sender */}
                  <Text style={isFromMe ? styles.timestamp : styles.receivedTimestamp}>
                    {sender} • {formatDate(message.date)}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </Page>
    </Document>
  );
}
