'use client';

import { useState } from 'react';
import { useInView } from 'react-intersection-observer';

interface VideoAttachmentProps {
  attachmentId: number;
  filename: string | null;
  dbPath: string;
  attachmentsPath: string;
}

export default function VideoAttachment({ 
  attachmentId, 
  filename, 
  dbPath, 
  attachmentsPath 
}: VideoAttachmentProps) {
  const [videoError, setVideoError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [thumbnailError, setThumbnailError] = useState(false);
  
  // Use intersection observer to only load videos when they're near the viewport
  const { ref, inView } = useInView({
    triggerOnce: true,
    rootMargin: '500px', // Start loading 500px before the video enters viewport
  });

  const videoUrl = `/api/attachments/${attachmentId}?dbPath=${encodeURIComponent(dbPath)}&attachmentsPath=${encodeURIComponent(attachmentsPath)}`;
  const thumbnailUrl = `/api/attachments/${attachmentId}/thumbnail?dbPath=${encodeURIComponent(dbPath)}&attachmentsPath=${encodeURIComponent(attachmentsPath)}`;

  const handleVideoLoad = () => {
    setIsLoading(false);
  };

  const handleVideoError = () => {
    setVideoError(true);
    setIsLoading(false);
  };

  const handleThumbnailError = () => {
    setThumbnailError(true);
  };

  if (videoError) {
    return (
      <div className="bg-gray-100 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-500">
          🎬 Video not available
        </p>
        {filename && (
          <p className="text-xs text-gray-400 mt-1">
            {filename}
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      {!inView && (
        <div className="bg-gray-100 rounded-lg flex items-center justify-center" style={{ minHeight: '200px' }}>
          <div className="text-sm text-gray-400">🎬 Video</div>
        </div>
      )}
      
      {inView && (
        <>
          {isLoading && (
            <div className="absolute inset-0 bg-gray-100 rounded-lg flex items-center justify-center" style={{ minHeight: '200px' }}>
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div>
            </div>
          )}
          
          <video
            src={videoUrl}
            poster={thumbnailError ? undefined : thumbnailUrl}
            controls
            preload="metadata"
            onLoadedMetadata={handleVideoLoad}
            onError={handleVideoError}
            className="block w-full h-auto"
            style={{
              maxHeight: '380px',
              display: isLoading ? 'none' : 'block'
            }}
          >
            <source src={videoUrl} type="video/mp4" />
            <source src={videoUrl} type="video/quicktime" />
            Your browser does not support the video tag.
          </video>
          
          {/* Hidden image to detect thumbnail loading errors */}
          {!thumbnailError && (
            <img
              src={thumbnailUrl}
              onError={handleThumbnailError}
              style={{ display: 'none' }}
              alt=""
            />
          )}
        </>
      )}
    </div>
  );
}

