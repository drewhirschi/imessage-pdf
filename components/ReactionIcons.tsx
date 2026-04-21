import type { ReactionType } from '@/lib/db/types';

interface Props {
  type: ReactionType;
  className?: string;
}

// Inline SVG so fill="currentColor" inherits from the wrapping element's text color.
export default function ReactionIcon({ type, className = 'w-4 h-4' }: Props) {
  switch (type) {
    case 'heart':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
          <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      );
    case 'thumbs_up':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
          <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 0 1 6 15.375c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V3a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23h-.777ZM2.331 10.977a11.969 11.969 0 0 0-.831 4.398 12 12 0 0 0 .52 3.507c.26.85 1.084 1.368 1.973 1.368H4.9c.445 0 .72-.498.523-.898a8.963 8.963 0 0 1-.924-3.977c0-1.708.476-3.305 1.302-4.666.245-.403-.028-.959-.5-.959H4.25c-.832 0-1.612.453-1.918 1.227Z" />
        </svg>
      );
    case 'thumbs_down':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
          <path d="M15.73 5.25h1.035A7.465 7.465 0 0 1 18 9.375a7.465 7.465 0 0 1-1.235 4.125h-.148c-.806 0-1.534.446-2.031 1.08a9.04 9.04 0 0 1-2.861 2.4c-.723.384-1.35.956-1.653 1.715a4.498 4.498 0 0 0-.322 1.672V21a.75.75 0 0 1-.75.75 2.25 2.25 0 0 1-2.25-2.25c0-1.152.26-2.243.723-3.218.266-.558-.107-1.282-.725-1.282H3.126c-1.026 0-1.945-.694-2.054-1.715A12.134 12.134 0 0 1 1 12a11.95 11.95 0 0 1 2.649-7.521c.388-.482.987-.729 1.605-.729H9.77c.483 0 .964.078 1.423.23l3.114 1.04c.46.152.94.23 1.423.23ZM21.669 13.773c.536-1.362.831-2.845.831-4.398 0-1.22-.182-2.398-.52-3.507-.26-.85-1.084-1.368-1.973-1.368H19.1c-.445 0-.72.498-.523.898.591 1.2.924 2.55.924 3.977a8.958 8.958 0 0 1-1.302 4.666c-.245.403.028.959.5.959h1.053c.832 0 1.612-.453 1.918-1.227Z" />
        </svg>
      );
    case 'laugh':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
          <text
            x="12"
            y="16.5"
            textAnchor="middle"
            fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
            fontSize="11"
            fontWeight="800"
            letterSpacing="-0.5"
          >
            HA
          </text>
        </svg>
      );
    case 'emphasize':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
          <rect x="8.25" y="5" width="2.25" height="10" rx="1" />
          <circle cx="9.375" cy="17.75" r="1.35" />
          <rect x="13.5" y="5" width="2.25" height="10" rx="1" />
          <circle cx="14.625" cy="17.75" r="1.35" />
        </svg>
      );
    case 'question':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
          <text
            x="12"
            y="18"
            textAnchor="middle"
            fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
            fontSize="16"
            fontWeight="800"
          >
            ?
          </text>
        </svg>
      );
  }
}

export const reactionLabels: Record<ReactionType, string> = {
  heart: 'Loved',
  thumbs_up: 'Liked',
  thumbs_down: 'Disliked',
  laugh: 'Laughed at',
  emphasize: 'Emphasized',
  question: 'Questioned',
};
