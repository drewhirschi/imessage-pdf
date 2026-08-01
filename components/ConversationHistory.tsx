'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ConversationAvailability } from '@/lib/db/types';
import { imessageToDate } from '@/lib/utils/timestamp';

interface Props {
  availability: ConversationAvailability;
}

interface Period {
  key: string;
  label: string;
  count: number;
}

function shade(count: number, max: number): string {
  if (count === 0) return 'rgba(229, 231, 235, 0.75)';
  const intensity = Math.log1p(count) / Math.log1p(Math.max(1, max));
  return `rgba(37, 99, 235, ${0.18 + intensity * 0.78})`;
}

function historySpan(first: Date, last: Date): string {
  const firstIndex = first.getFullYear() * 12 + first.getMonth();
  const lastIndex = last.getFullYear() * 12 + last.getMonth();
  const months = Math.max(1, lastIndex - firstIndex + 1);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return remainder === 0
    ? `${years} year${years === 1 ? '' : 's'}`
    : `${years} year${years === 1 ? '' : 's'}, ${remainder} month${remainder === 1 ? '' : 's'}`;
}

export default function ConversationHistory({ availability }: Props) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const counts = useMemo(
    () => new Map(availability.messagesByMonth.map((item) => [item.month, item.count])),
    [availability.messagesByMonth],
  );

  if (!availability.firstMessageDate || !availability.lastMessageDate) return null;

  const first = imessageToDate(availability.firstMessageDate);
  const last = imessageToDate(availability.lastMessageDate);
  const years: Period[] = [];
  for (let year = first.getFullYear(); year <= last.getFullYear(); year += 1) {
    let count = 0;
    for (let month = 1; month <= 12; month += 1) {
      count += counts.get(`${year}-${String(month).padStart(2, '0')}`) ?? 0;
    }
    years.push({ key: String(year), label: String(year), count });
  }
  const maxYear = Math.max(1, ...years.map((year) => year.count));

  const months: Period[] = selectedYear == null
    ? []
    : Array.from({ length: 12 }, (_, index) => {
        const date = new Date(selectedYear, index, 1);
        const key = `${selectedYear}-${String(index + 1).padStart(2, '0')}`;
        return { key, label: format(date, 'MMM'), count: counts.get(key) ?? 0 };
      });
  const maxMonth = Math.max(1, ...months.map((month) => month.count));

  return (
    <section className="border-b border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Message history
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {historySpan(first, last)} in this database
          </p>
          <p className="text-[11px] text-gray-500">
            {format(first, 'MMM yyyy')} – {format(last, 'MMM yyyy')}
          </p>
        </div>
        <span className="text-[11px] tabular-nums text-gray-500">
          {availability.totalMessages.toLocaleString()}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {years.map((year) => {
          const active = selectedYear === Number(year.key);
          return (
            <button
              key={year.key}
              type="button"
              onClick={() => setSelectedYear(active ? null : Number(year.key))}
              title={`${year.label}: ${year.count.toLocaleString()} messages`}
              aria-pressed={active}
              className={`flex h-10 items-center justify-center rounded border text-[10px] font-semibold tabular-nums transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                active ? 'border-blue-700 ring-2 ring-blue-200' : 'border-black/5'
              } ${year.count === 0 ? 'text-gray-500' : 'text-white'}`}
              style={{ backgroundColor: shade(year.count, maxYear) }}
            >
              {year.label}
            </button>
          );
        })}
      </div>

      {selectedYear != null && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-gray-700">{selectedYear}</span>
            <button
              type="button"
              onClick={() => setSelectedYear(null)}
              className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 hover:text-gray-800"
            >
              Collapse <ChevronUp className="size-3" />
            </button>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {months.map((month) => {
              const monthName = format(new Date(`${month.key}-01T00:00:00`), 'MMMM yyyy');
              const messageLabel = `${month.count.toLocaleString()} ${month.count === 1 ? 'message' : 'messages'}`;

              return (
                <div key={month.key} className="group relative text-center">
                  <div
                    tabIndex={0}
                    aria-label={`${monthName}: ${messageLabel}`}
                    className={`h-7 rounded border border-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${month.count === 0 ? 'text-gray-500' : 'text-white'}`}
                    style={{ backgroundColor: shade(month.count, maxMonth) }}
                  />
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded bg-gray-950 px-2 py-1 text-left text-[10px] leading-tight text-white shadow-md group-hover:block group-focus-within:block"
                  >
                    <span className="block font-medium">{monthName}</span>
                    <span className="text-gray-300">{messageLabel}</span>
                  </div>
                  <span className="mt-0.5 block text-[9px] text-gray-500">{month.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedYear == null && years.length > 0 && (
        <p className="mt-2 flex items-center gap-1 text-[10px] text-gray-500">
          Select a year to inspect its months <ChevronDown className="size-3" />
        </p>
      )}
    </section>
  );
}
