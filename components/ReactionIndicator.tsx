'use client';

import Image from 'next/image';
import type { Reaction, ReactionType } from '@/lib/db/types';

interface ReactionIndicatorProps {
  reactions: Reaction[];
  isFromMe: boolean;
  onClick: () => void;
}

const reactionConfig: Record<ReactionType, { icon: string; label: string }> = {
  heart: { icon: '/reactions/heart.svg', label: 'Love' },
  thumbs_up: { icon: '/reactions/thumbs-up.svg', label: 'Like' },
  thumbs_down: { icon: '/reactions/thumbs-down.svg', label: 'Dislike' },
  laugh: { icon: '/reactions/laugh.svg', label: 'Laugh' },
  emphasize: { icon: '/reactions/emphasize.svg', label: 'Emphasize' },
  question: { icon: '/reactions/question.svg', label: 'Question' },
};

export default function ReactionIndicator({ 
  reactions, 
  isFromMe, 
  onClick 
}: ReactionIndicatorProps) {
  if (reactions.length === 0) {
    return null;
  }

  // Group reactions by type
  const groupedReactions = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.reaction_type]) {
      acc[reaction.reaction_type] = [];
    }
    acc[reaction.reaction_type].push(reaction);
    return acc;
  }, {} as Record<ReactionType, Reaction[]>);

  // Get the first few reaction types to display
  const reactionTypes = Object.keys(groupedReactions) as ReactionType[];
  const displayReactions = reactionTypes.slice(0, 3); // Show up to 3 reaction types

  return (
    <div 
      className={`absolute -top-4 ${isFromMe ? 'left-2' : 'right-2'} flex items-center gap-0.5 cursor-pointer transition-transform hover:scale-110`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {displayReactions.map((type, index) => {
        const count = groupedReactions[type].length;
        const config = reactionConfig[type];
        
        return (
          <div 
            key={type}
            className="relative bg-white rounded-full shadow-md border-2 border-white"
            style={{
              marginLeft: index > 0 ? '-6px' : '0',
              zIndex: displayReactions.length - index,
            }}
          >
            <Image 
              src={config.icon} 
              alt={config.label} 
              width={20} 
              height={20}
              className="block"
            />
            {count > 1 && (
              <div className="absolute -bottom-1 -right-1 bg-gray-800 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-1 border border-white">
                {count}
              </div>
            )}
          </div>
        );
      })}
      
      {/* Show "+X more" if there are more than 3 reaction types */}
      {reactionTypes.length > 3 && (
        <div className="ml-1 bg-gray-800 text-white text-[10px] font-medium rounded-full px-1.5 py-0.5 border border-white">
          +{reactionTypes.length - 3}
        </div>
      )}
    </div>
  );
}
