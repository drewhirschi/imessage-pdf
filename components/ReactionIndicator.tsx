'use client';

interface Reaction {
  message_id: number;
  handle_id: number;
  reaction_type: string;
  date: number;
}

interface ReactionIndicatorProps {
  reactions: Reaction[];
}

const reactionEmojis: Record<string, string> = {
  heart: '❤️',
  thumbs_up: '👍',
  thumbs_down: '👎',
  laugh: '😂',
  exclamation: '❗',
  question: '❓',
  love: '😍',
  angry: '😠',
  sad: '😢',
  surprised: '😮'
};

export default function ReactionIndicator({ reactions }: ReactionIndicatorProps) {
  if (reactions.length === 0) {
    return null;
  }

  // Group reactions by type
  const groupedReactions = reactions.reduce((acc, reaction) => {
    const emoji = reactionEmojis[reaction.reaction_type] || '👍';
    if (!acc[emoji]) {
      acc[emoji] = 0;
    }
    acc[emoji]++;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex items-center space-x-1 mt-1">
      {Object.entries(groupedReactions).map(([emoji, count]) => (
        <span
          key={emoji}
          className="text-xs bg-white bg-opacity-20 rounded-full px-2 py-1"
        >
          {emoji} {count > 1 ? count : ''}
        </span>
      ))}
    </div>
  );
}
