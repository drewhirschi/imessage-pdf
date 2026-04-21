'use client';

import ReactionIcon from './ReactionIcons';
import type { Reaction, ReactionType } from '@/lib/db/types';

interface ReactionIndicatorProps {
  reactions: Reaction[];
  /** Whether the message being reacted to is from me (controls tapback position). */
  isFromMe: boolean;
  onClick: () => void;
}

export default function ReactionIndicator({
  reactions,
  isFromMe,
  onClick,
}: ReactionIndicatorProps) {
  if (reactions.length === 0) return null;

  // Group by type; remember if any of the reactors was me (determines color).
  const groups = new Map<ReactionType, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const existing = groups.get(r.reaction_type) ?? { count: 0, mine: false };
    existing.count += 1;
    if (r.is_from_me === 1) existing.mine = true;
    groups.set(r.reaction_type, existing);
  }

  const entries = Array.from(groups.entries());
  const visible = entries.slice(0, 3);
  const hidden = entries.length - visible.length;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      // Sit on the bubble's inside edge (the corner facing the other side
      // of the conversation) and slightly above the top — matching iMessage,
      // where the tapback straddles the corner rather than sitting fully
      // inside the bubble.
      className={`absolute -top-5 ${isFromMe ? '-left-3' : '-right-3'} flex items-center cursor-pointer transition-transform hover:scale-105`}
    >
      {visible.map(([type, { count, mine }], index) => {
        const bgClass = mine
          ? 'bg-[#007AFF] text-white'
          : 'bg-[#E9E9EB] text-[#3C3C43]';
        return (
          <div
            key={type}
            className={`${bgClass} relative flex items-center justify-center rounded-full w-7 h-7 shadow-sm ring-2 ring-white`}
            style={{
              marginLeft: index > 0 ? '-8px' : '0',
              zIndex: visible.length - index,
            }}
          >
            <ReactionIcon type={type} className="w-[14px] h-[14px]" />
            {count > 1 && (
              <span className="absolute -bottom-0.5 -right-1 bg-gray-800 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-1 ring-1 ring-white">
                {count}
              </span>
            )}
          </div>
        );
      })}
      {hidden > 0 && (
        <div
          className="ml-1 bg-gray-800 text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5 ring-2 ring-white"
          style={{ zIndex: 0 }}
        >
          +{hidden}
        </div>
      )}
    </div>
  );
}
