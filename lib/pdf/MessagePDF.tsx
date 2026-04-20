import React from 'react';
import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { styles } from './styles';
import { imessageToDate } from '../utils/timestamp';
import './fonts'; // Import to register fonts

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
  imageData?: string; // Base64 encoded image data
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

interface MessagePDFProps {
  title: string;
  participants: string[];
  messages: MessageWithAttachments[];
  startDate?: number;
  endDate?: number;
  nameMap?: Record<string, string>;
}

function normalizeHandle(h: string): string {
  if (h.includes('@')) return h.toLowerCase().trim();
  return h.replace(/\D/g, '');
}

function makeResolver(nameMap: Record<string, string> | undefined) {
  if (!nameMap) return (id: string | null | undefined) => id ?? null;
  const normMap = new Map<string, string>();
  for (const [k, v] of Object.entries(nameMap)) {
    normMap.set(normalizeHandle(k), v);
  }
  return (id: string | null | undefined) => {
    if (!id) return null;
    return nameMap[id] ?? normMap.get(normalizeHandle(id)) ?? id;
  };
}

export default function MessagePDF({
  title,
  participants,
  messages,
  startDate,
  endDate,
  nameMap,
}: MessagePDFProps) {
  const resolveName = makeResolver(nameMap);
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

  const formatReactions = (reactions?: Reaction[]) => {
    if (!reactions || reactions.length === 0) return null;

    const reactionEmojis: Record<string, string> = {
      heart: '❤️',
      thumbs_up: '👍',
      thumbs_down: '👎',
      laugh: '😂',
      emphasize: '‼️',
      question: '❓',
    };

    // Group reactions by type
    const grouped = reactions.reduce((acc, reaction) => {
      const emoji = reactionEmojis[reaction.reaction_type] || '👍';
      if (!acc[emoji]) {
        acc[emoji] = { count: 0, senders: [] };
      }
      acc[emoji].count++;
      const sender = reaction.is_from_me === 1
        ? 'You'
        : (resolveName(reaction.sender_id) || reaction.sender_id || 'Unknown');
      acc[emoji].senders.push(sender);
      return acc;
    }, {} as Record<string, { count: number; senders: string[] }>);

    return Object.entries(grouped).map(([emoji, data]) => {
      const sendersText = data.senders.slice(0, 3).join(', ');
      const moreText = data.senders.length > 3 ? ` +${data.senders.length - 3} more` : '';
      return `${emoji} ${data.count} (${sendersText}${moreText})`;
    }).join(' • ');
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
              const { message, handle, attachments, reactions } = messageData;
              const isFromMe = message.is_from_me === 1;
              const sender = isFromMe
                ? 'You'
                : (resolveName(handle?.id) || handle?.id || 'Unknown');
              const reactionText = formatReactions(reactions);
              
              return (
                <View key={message.ROWID} style={styles.messageContainer}>
                  {/* Message bubble */}
                  <View style={[
                    styles.messageBubble,
                    isFromMe ? styles.sentMessage : styles.receivedMessage
                  ]}>
                    {/* Message text — strip U+FFFC attachment placeholder */}
                    {(() => {
                      const cleaned = message.text?.replace(/\uFFFC/g, '').trim();
                      return cleaned ? (
                        <Text style={styles.messageText}>{cleaned}</Text>
                      ) : null;
                    })()}
                    
                    {/* Attachments */}
                    {attachments.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        {attachments.map((attachment) => (
                          <View key={attachment.ROWID}>
                            {attachment.imageData ? (
                              // Render actual image if we have the data
                              <Image 
                                src={attachment.imageData} 
                                style={styles.attachmentImage}
                              />
                            ) : attachment.mime_type?.startsWith('image/') ? (
                              // Placeholder for images without data
                              <View style={styles.imagePlaceholder}>
                                <Text style={styles.imageText}>
                                  📷 {attachment.filename || 'Image'}
                                </Text>
                              </View>
                            ) : (
                              // Non-image attachments
                              <View style={styles.attachment}>
                                <Text style={styles.imageText}>
                                  📎 {attachment.filename || 'Attachment'}
                                </Text>
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Reactions */}
                    {reactionText && (
                      <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: isFromMe ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' }}>
                        <Text style={{ fontSize: 9, color: isFromMe ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.6)' }}>
                          {reactionText}
                        </Text>
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
