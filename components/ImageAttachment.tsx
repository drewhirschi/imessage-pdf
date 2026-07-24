'use client';

import { useState } from 'react';
import { useInView } from 'react-intersection-observer';

interface ImageAttachmentProps {
  attachmentId: number;
  filename: string | null;
  dbPath: string;
  attachmentsPath: string;
  /**
   * How the image sits in its slot.
   * - `single`: natural aspect ratio, height-capped so tall portrait
   *   screenshots don't dominate the column.
   * - `cover`: fills a fixed-height cell (used in multi-image grids).
   */
  variant?: 'single' | 'cover';
}

export default function ImageAttachment({
  attachmentId,
  filename,
  dbPath,
  attachmentsPath,
  variant = 'single',
}: ImageAttachmentProps) {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  // Only load images when they're near the viewport (kept once loaded).
  const { ref, inView } = useInView({
    triggerOnce: true,
    rootMargin: '500px',
  });

  const imageUrl = `/api/attachments/${attachmentId}?dbPath=${encodeURIComponent(dbPath)}&attachmentsPath=${encodeURIComponent(attachmentsPath)}`;

  const handleRetry = () => {
    setImageError(false);
    setIsLoading(true);
    setRetryCount((prev) => prev + 1);
  };

  const isCover = variant === 'cover';

  if (imageError) {
    return (
      <div className="bg-gray-100 p-4 text-center h-full flex flex-col items-center justify-center">
        <p className="text-sm text-gray-500">📷 Image not available</p>
        {filename && <p className="text-xs text-gray-400 mt-1 break-all">{filename}</p>}
        <button
          onClick={handleRetry}
          className="mt-3 px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // The parent (a rounded, overflow-hidden media bubble) owns the corner radius.
  // `single` caps height and keeps aspect; `cover` fills a fixed grid cell.
  const imgClass = isCover
    ? 'block w-full h-full object-cover'
    : 'block w-full h-auto';
  const imgStyle: React.CSSProperties = isCover
    ? { display: isLoading ? 'none' : 'block' }
    : { maxHeight: '320px', width: 'auto', display: isLoading ? 'none' : 'block' };

  return (
    <div ref={ref} className="relative w-full h-full">
      {!inView && (
        <div className="bg-gray-100 flex items-center justify-center w-full h-full" style={{ minHeight: '120px' }}>
          <div className="text-sm text-gray-400">Loading...</div>
        </div>
      )}

      {inView && (
        <>
          {isLoading && (
            <div className="absolute inset-0 bg-gray-100 flex items-center justify-center" style={{ minHeight: '120px' }}>
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div>
            </div>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={retryCount}
            src={imageUrl}
            alt={filename || 'Message attachment'}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setImageError(true);
              setIsLoading(false);
            }}
            className={imgClass}
            style={imgStyle}
          />
        </>
      )}
    </div>
  );
}
