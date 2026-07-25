'use client';

import { format } from 'date-fns';
import { imessageToDate } from '@/lib/utils/timestamp';
import { useContactsOptional } from './ContactsProvider';
import InlineNameEditor from './InlineNameEditor';
import ReactionIcon, { reactionLabels } from './ReactionIcons';
import type { Reaction, ReactionType } from '@/lib/db/types';

interface ReactionDetailsModalProps {
  reactions: Reaction[];
  onClose: () => void;
  isOpen: boolean;
}


export default function ReactionDetailsModal({
  reactions,
  onClose,
  isOpen
}: ReactionDetailsModalProps) {
  const contacts = useContactsOptional();
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
              const reactionType = type as ReactionType;
              const label = reactionLabels[reactionType];
              return (
                <div key={type} className="border-b last:border-b-0">
                  {/* Reaction Type Header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-gray-50">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#E9E9EB] text-[#3C3C43] flex items-center justify-center">
                      <ReactionIcon type={reactionType} className="w-[14px] h-[14px]" />
                    </div>
                    <span className="font-medium text-gray-900">
                      {label} {typeReactions.length > 1 && `(${typeReactions.length})`}
                    </span>
                  </div>

                  {/* People who reacted */}
                  <div className="divide-y">
                    {typeReactions.map((reaction) => {
                      const timestamp = imessageToDate(reaction.date);
                      const resolved = reaction.sender_id
                        ? contacts?.resolve(reaction.sender_id) ?? null
                        : null;
                      const sender = reaction.is_from_me === 1
                        ? 'You'
                        : resolved ?? reaction.sender_id ?? 'Unknown';

                      return (
                        <div
                          key={reaction.ROWID}
                          className="px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium text-gray-900 truncate">{sender}</span>
                              {reaction.is_from_me !== 1 &&
                                reaction.sender_id &&
                                !resolved &&
                                contacts && (
                                  <InlineNameEditor handleId={reaction.sender_id} />
                                )}
                            </div>
                            <span className="text-xs text-gray-500 flex-shrink-0">
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
