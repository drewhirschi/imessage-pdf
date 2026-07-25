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
   * - `link-preview`: stable media region inside a rich-link card.
   */
  variant?: 'single' | 'cover' | 'link-preview';
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
    // Start loading well before the image reaches the viewport. The reserved
    // placeholder below keeps scroll geometry stable while the request runs.
    rootMargin: '1500px 0px',
  });

  const imageUrl = `/api/attachments/${attachmentId}?dbPath=${encodeURIComponent(dbPath)}&attachmentsPath=${encodeURIComponent(attachmentsPath)}`;

  const handleRetry = () => {
    setImageError(false);
    setIsLoading(true);
    setRetryCount((prev) => prev + 1);
  };

  const isCover = variant === 'cover';
  const isLinkPreview = variant === 'link-preview';
  const placeholderHeight = isLinkPreview
    ? '56px'
    : isCover
      ? '100%'
      : '320px';

  if (imageError) {
    if (variant === 'link-preview') {
      return <div className="size-14 bg-gray-100" aria-hidden />;
    }
    const basename = filename?.split('/').pop();
    return (
      <div className="bg-gray-100 p-4 text-center h-full flex flex-col items-center justify-center">
        <p className="text-sm text-gray-500">📷 Image not available</p>
        {basename && (
          <p className="text-xs text-gray-400 mt-1 break-all">{basename}</p>
        )}
        {/* Interactive chrome has no place on paper. */}
        <button
          onClick={handleRetry}
          className="mt-3 px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors print:hidden"
        >
          Try Again
        </button>
      </div>
    );
  }

  // The parent (a rounded, overflow-hidden media bubble) owns the corner radius.
  // `single` caps height and keeps aspect; `cover` fills a fixed grid cell.
  const imgClass = isCover
      ? 'block h-full w-full object-cover'
      : isLinkPreview
      ? 'block size-14 object-contain'
      : 'block h-auto w-full';
  const imgStyle: React.CSSProperties =
    isCover || isLinkPreview
      ? { display: isLoading ? 'none' : 'block' }
      : {
          maxHeight: '320px',
          maxWidth: '260px',
          width: 'auto',
          display: isLoading ? 'none' : 'block',
        };

  return (
    <div
      ref={ref}
      className={`relative ${
        isLinkPreview
          ? 'size-14 bg-black/5'
          : isCover
            ? 'h-full w-full'
            : isLoading
              ? 'min-h-[320px] w-[260px]'
              : 'w-fit max-w-full'
      }`}
    >
      {!inView && (
        <div
          className="flex h-full w-full items-center justify-center bg-gray-100"
          style={{ minHeight: placeholderHeight }}
        >
          <div className="text-sm text-gray-400">Loading...</div>
        </div>
      )}

      {inView && (
        <>
          {isLoading && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-gray-100"
              style={{ minHeight: placeholderHeight }}
            >
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
