'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DateRangePickerProps {
  onDateRangeChange: (startDate: Date | null, endDate: Date | null) => void;
  className?: string;
  initialStartDate?: Date | null;
  initialEndDate?: Date | null;
  compact?: boolean;
}

function sameDate(a?: Date, b?: Date): boolean {
  return a?.getTime() === b?.getTime();
}

export default function DateRangePicker({
  onDateRangeChange,
  className = '',
  initialStartDate = null,
  initialEndDate = null,
  compact = false,
}: DateRangePickerProps) {
  const [temporaryStart, setTemporaryStart] = useState<Date | undefined>(
    initialStartDate ?? undefined,
  );
  const [temporaryEnd, setTemporaryEnd] = useState<Date | undefined>(
    initialEndDate ?? undefined,
  );
  const [appliedStart, setAppliedStart] = useState<Date | undefined>(
    initialStartDate ?? undefined,
  );
  const [appliedEnd, setAppliedEnd] = useState<Date | undefined>(
    initialEndDate ?? undefined,
  );
  const [startView, setStartView] = useState(initialStartDate ?? new Date());
  const [endView, setEndView] = useState(initialEndDate ?? new Date());
  const [open, setOpen] = useState(false);

  const hasChanges =
    !sameDate(temporaryStart, appliedStart) ||
    !sameDate(temporaryEnd, appliedEnd);
  const hasSelection = !!temporaryStart || !!temporaryEnd;
  const hasCompleteRange =
    !!temporaryStart && !!temporaryEnd && temporaryEnd >= temporaryStart;
  const selectedRange: DateRange | undefined = temporaryStart
    ? { from: temporaryStart, to: temporaryEnd }
    : undefined;

  const label = temporaryStart
    ? temporaryEnd
      ? `${format(temporaryStart, 'MMM d, yyyy')} – ${format(temporaryEnd, 'MMM d, yyyy')}`
      : `${format(temporaryStart, 'MMM d, yyyy')} – Pick end date`
    : 'Select date range';

  const applyDates = () => {
    if (!hasCompleteRange) return;
    setAppliedStart(temporaryStart);
    setAppliedEnd(temporaryEnd);
    onDateRangeChange(temporaryStart ?? null, temporaryEnd ?? null);
    setOpen(false);
  };

  const clearDates = () => {
    setTemporaryStart(undefined);
    setTemporaryEnd(undefined);
    setAppliedStart(undefined);
    setAppliedEnd(undefined);
    onDateRangeChange(null, null);
  };

  return (
    <div
      className={cn(
        compact ? '' : 'rounded-md border bg-white p-4',
        className,
      )}
    >
      {!compact && (
        <h3 className="mb-3 text-sm font-medium text-gray-900">Date range</h3>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-auto min-h-9 w-full justify-start whitespace-normal px-2.5 py-2 text-left text-xs font-normal"
          >
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            <span className={cn(!temporaryStart && 'text-muted-foreground')}>
              {label}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] overflow-x-auto p-0" align="start">
          <div className="grid grid-cols-2 divide-x">
            <div>
              <div className="border-b bg-gray-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Start</p>
                <p className="mt-0.5 text-sm font-medium text-foreground">
                  {temporaryStart ? format(temporaryStart, 'MMM d, yyyy') : 'Select a day'}
                </p>
              </div>
              <Calendar
                autoFocus
                mode="range"
                captionLayout="dropdown"
                startMonth={new Date(2001, 0)}
                endMonth={new Date()}
                month={startView}
                onMonthChange={setStartView}
                selected={selectedRange}
                disabled={temporaryEnd ? { after: temporaryEnd } : undefined}
                onDayClick={(day) => setTemporaryStart(day)}
              />
            </div>
            <div>
              <div className="border-b bg-gray-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">End</p>
                <p className="mt-0.5 text-sm font-medium text-foreground">
                  {temporaryEnd ? format(temporaryEnd, 'MMM d, yyyy') : 'Select a day'}
                </p>
              </div>
              <Calendar
                mode="range"
                captionLayout="dropdown"
                startMonth={new Date(2001, 0)}
                endMonth={new Date()}
                month={endView}
                onMonthChange={setEndView}
                selected={selectedRange}
                disabled={temporaryStart ? { before: temporaryStart } : undefined}
                onDayClick={(day) => setTemporaryEnd(day)}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={clearDates}
          disabled={!hasSelection}
          className="flex-1"
        >
          Clear
        </Button>
        <Button
          size="sm"
          onClick={applyDates}
          disabled={!hasCompleteRange || !hasChanges}
          className="flex-1"
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
