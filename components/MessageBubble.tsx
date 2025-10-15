'use client';

import { format } from 'date-fns';
import ImageAttachment from './ImageAttachment';
import VideoAttachment from './VideoAttachment';

interface Message {
  ROWID: number;
  text: string | null;
  date: number;
  is_from_me: number;
  handle_id: number | null;
  // ... other message properties
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

interface MessageBubbleProps {
  message: Message;
  handle: Handle | null;
  attachments: Attachment[];
  dbPath: string;
  attachmentsPath: string;
}

// Helper function to detect and render URLs as clickable links
function renderTextWithLinks(text: string, isFromMe: boolean) {
  // URL regex pattern
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlPattern);
  
  return parts.map((part, index) => {
    if (part.match(urlPattern)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline hover:opacity-80 ${isFromMe ? 'text-blue-100' : 'text-blue-600'}`}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

export default function MessageBubble({ 
  message, 
  handle, 
  attachments, 
  dbPath, 
  attachmentsPath 
}: MessageBubbleProps) {
  const isFromMe = message.is_from_me === 1;
  const sender = isFromMe ? 'You' : (handle?.id || 'Unknown');
  const timestamp = new Date(message.date * 1000);
  const isValidDate = !isNaN(timestamp.getTime());

  return (
    <div className={`flex ${isFromMe ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-xs lg:max-w-md ${isFromMe ? 'order-2' : 'order-1'}`}>
        {/* Sender and timestamp */}
        <div className={`text-xs text-gray-500 mb-1 ${isFromMe ? 'text-right' : 'text-left'}`}>
          <span className="font-medium">{sender}</span>
          {isValidDate && <span className="ml-2">{format(timestamp, 'h:mm a')}</span>}
        </div>
        
        {/* Message bubble */}
        <div
          className={`rounded-2xl px-4 py-2 ${
            isFromMe
              ? 'bg-blue-500 text-white rounded-br-md'
              : 'bg-gray-200 text-gray-900 rounded-bl-md'
          }`}
        >
          {/* Message text */}
          {message.text && (
            <p className="text-sm whitespace-pre-wrap break-words">
              {renderTextWithLinks(message.text, isFromMe)}
            </p>
          )}
          
          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="mt-2 space-y-2">
              {attachments.map((attachment) => {
                // Check if attachment is an image based on mime_type or file extension
                const isImage = attachment.mime_type?.startsWith('image/') || 
                  attachment.filename?.match(/\.(jpg|jpeg|png|gif|webp|heic|heif|pluginPayloadAttachment)$/i);
                
                // Check if attachment is a video based on mime_type or file extension
                const isVideo = attachment.mime_type?.startsWith('video/') || 
                  attachment.filename?.match(/\.(mov|mp4|avi|webm|m4v|mkv)$/i);
                
                return (
                  <div key={attachment.ROWID}>
                    {isImage ? (
                      <ImageAttachment
                        attachmentId={attachment.ROWID}
                        filename={attachment.filename}
                        dbPath={dbPath}
                        attachmentsPath={attachmentsPath}
                      />
                    ) : isVideo ? (
                      <VideoAttachment
                        attachmentId={attachment.ROWID}
                        filename={attachment.filename}
                        dbPath={dbPath}
                        attachmentsPath={attachmentsPath}
                      />
                    ) : (
                      <div className="bg-black bg-opacity-10 rounded-lg p-2">
                        <p className="text-xs">
                          📎 {attachment.filename || 'Unknown file'}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Date (shown on hover or for first message of day) */}
        {isValidDate && (
          <div className={`text-xs text-gray-400 mt-1 ${isFromMe ? 'text-right' : 'text-left'}`}>
            {format(timestamp, 'MMM d, yyyy')}
          </div>
        )}
      </div>
    </div>
  );
}
