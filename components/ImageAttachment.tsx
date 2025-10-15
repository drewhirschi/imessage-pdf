'use client';

import { useState } from 'react';
import { useInView } from 'react-intersection-observer';

interface ImageAttachmentProps {
  attachmentId: number;
  filename: string | null;
  dbPath: string;
  attachmentsPath: string;
}

export default function ImageAttachment({ 
  attachmentId, 
  filename, 
  dbPath, 
  attachmentsPath 
}: ImageAttachmentProps) {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  
  // Use intersection observer to only load images when they're near the viewport
  const { ref, inView } = useInView({
    triggerOnce: true, // Only trigger once, don't unload when scrolling past
    rootMargin: '500px', // Start loading 500px before the image enters viewport
  });

  const imageUrl = `/api/attachments/${attachmentId}?dbPath=${encodeURIComponent(dbPath)}&attachmentsPath=${encodeURIComponent(attachmentsPath)}`;

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setIsLoading(false);
  };

  const handleRetry = () => {
    setImageError(false);
    setIsLoading(true);
    setRetryCount(prev => prev + 1);
  };

  if (imageError) {
    return (
      <div className="bg-gray-100 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-500">
          📷 Image not available
        </p>
        {filename && (
          <p className="text-xs text-gray-400 mt-1">
            {filename}
          </p>
        )}
        <button
          onClick={handleRetry}
          className="mt-3 px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      {!inView && (
        <div className="bg-gray-100 rounded-lg flex items-center justify-center" style={{ minHeight: '100px' }}>
          <div className="text-sm text-gray-400">Loading...</div>
        </div>
      )}
      
      {inView && (
        <>
          {isLoading && (
            <div className="absolute inset-0 bg-gray-100 rounded-lg flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div>
            </div>
          )}
          
          <img
            key={retryCount}
            src={imageUrl}
            alt={filename || 'Message attachment'}
            onLoad={handleImageLoad}
            onError={handleImageError}
            className="max-w-full h-auto rounded-lg shadow-sm"
            style={{ 
              maxHeight: '300px',
              display: isLoading ? 'none' : 'block'
            }}
          />
        </>
      )}
    </div>
  );
}
