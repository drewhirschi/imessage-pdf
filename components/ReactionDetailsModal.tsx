'use client';

import { format } from 'date-fns';
import Image from 'next/image';
import { imessageToDate } from '@/lib/utils/timestamp';
import type { Reaction, ReactionType } from '@/lib/db/types';

interface ReactionDetailsModalProps {
  reactions: Reaction[];
  onClose: () => void;
  isOpen: boolean;
}

const reactionConfig: Record<ReactionType, { icon: string; label: string; emoji: string }> = {
  heart: { icon: '/reactions/heart.svg', label: 'Loved', emoji: '❤️' },
  thumbs_up: { icon: '/reactions/thumbs-up.svg', label: 'Liked', emoji: '👍' },
  thumbs_down: { icon: '/reactions/thumbs-down.svg', label: 'Disliked', emoji: '👎' },
  laugh: { icon: '/reactions/laugh.svg', label: 'Laughed at', emoji: '😂' },
  emphasize: { icon: '/reactions/emphasize.svg', label: 'Emphasized', emoji: '‼️' },
  question: { icon: '/reactions/question.svg', label: 'Questioned', emoji: '❓' },
};

export default function ReactionDetailsModal({ 
  reactions, 
  onClose, 
  isOpen 
}: ReactionDetailsModalProps) {
  if (!isOpen || reactions.length === 0) return null;

  // Group reactions by type
  const groupedReactions = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.reaction_type]) {
      acc[reaction.reaction_type] = [];
    }
    acc[reaction.reaction_type].push(reaction);
    return acc;
  }, {} as Record<ReactionType, Reaction[]>);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="text-lg font-semibold text-gray-900">Reactions</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(80vh-80px)]">
            {Object.entries(groupedReactions).map(([type, typeReactions]) => {
              const config = reactionConfig[type as ReactionType];
              return (
                <div key={type} className="border-b last:border-b-0">
                  {/* Reaction Type Header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-gray-50">
                    <Image 
                      src={config.icon} 
                      alt={config.label} 
                      width={20} 
                      height={20}
                      className="flex-shrink-0"
                    />
                    <span className="font-medium text-gray-900">
                      {config.label} {typeReactions.length > 1 && `(${typeReactions.length})`}
                    </span>
                  </div>

                  {/* People who reacted */}
                  <div className="divide-y">
                    {typeReactions.map((reaction) => {
                      const timestamp = imessageToDate(reaction.date);
                      const sender = reaction.is_from_me === 1 
                        ? 'You' 
                        : (reaction.sender_id || 'Unknown');
                      
                      return (
                        <div 
                          key={reaction.ROWID} 
                          className="px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-900">{sender}</span>
                            <span className="text-xs text-gray-500">
                              {format(timestamp, 'MMM d, h:mm a')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

