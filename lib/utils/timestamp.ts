import {
  format,
  formatDistanceToNow,
  isToday,
  isYesterday,
  differenceInMinutes,
  differenceInDays,
} from "date-fns";

/**
 * Convert iMessage timestamp (nanoseconds since 2001-01-01) to Unix timestamp (seconds)
 */
export function imessageToUnixTimestamp(imessageTimestamp: number): number {
  const APPLE_EPOCH = 978307200; // 2001-01-01 00:00:00 UTC in Unix time
  const timestampInSeconds = imessageTimestamp / 1000000000; // Convert nanoseconds to seconds
  return APPLE_EPOCH + timestampInSeconds;
}

/**
 * Convert iMessage timestamp to JavaScript Date object
 */
export function imessageToDate(imessageTimestamp: number): Date {
  return new Date(imessageToUnixTimestamp(imessageTimestamp) * 1000);
}

/**
 * Format relative time for conversations list
 * Shows: "Just now", "5 min ago", "Yesterday", "Oct 18, 2024"
 */
export function formatRelativeTime(date: Date): string {
  if (!date || isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const minutesAgo = differenceInMinutes(now, date);
  const daysAgo = differenceInDays(now, date);

  // Just now (less than 1 minute)
  if (minutesAgo < 1) {
    return "Just now";
  }

  // Minutes ago (1-59 minutes)
  if (minutesAgo < 60) {
    return `${minutesAgo} min ago`;
  }

  // Today - show time
  if (isToday(date)) {
    return format(date, "h:mm a");
  }

  // Yesterday
  if (isYesterday(date)) {
    return "Yesterday";
  }

  // This week (2-6 days ago) - show day name
  if (daysAgo < 7) {
    return format(date, "EEEE"); // Monday, Tuesday, etc.
  }

  // This year - show date without year
  if (date.getFullYear() === now.getFullYear()) {
    return format(date, "MMM d");
  }

  // Older - show full date
  return format(date, "MMM d, yyyy");
}

/**
 * Check if two messages are more than 5 minutes apart
 */
export function isMoreThan5MinutesApart(
  prevTimestamp: number,
  currentTimestamp: number
): boolean {
  const prevDate = imessageToDate(prevTimestamp);
  const currentDate = imessageToDate(currentTimestamp);
  return differenceInMinutes(currentDate, prevDate) >= 5;
}

/**
 * Check if two messages are on different days
 */
export function isDifferentDay(
  prevTimestamp: number,
  currentTimestamp: number
): boolean {
  const prevDate = imessageToDate(prevTimestamp);
  const currentDate = imessageToDate(currentTimestamp);

  return (
    prevDate.getFullYear() !== currentDate.getFullYear() ||
    prevDate.getMonth() !== currentDate.getMonth() ||
    prevDate.getDate() !== currentDate.getDate()
  );
}

/**
 * Convert Unix timestamp (seconds since 1970) to iMessage timestamp (nanoseconds since 2001-01-01)
 */
export function unixToImessageTimestamp(unixTimestamp: number): number {
  const APPLE_EPOCH = 978307200; // 2001-01-01 00:00:00 UTC in Unix time
  const secondsSinceAppleEpoch = unixTimestamp - APPLE_EPOCH;
  return secondsSinceAppleEpoch * 1000000000; // Convert to nanoseconds
}
