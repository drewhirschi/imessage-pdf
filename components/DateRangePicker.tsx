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
  const initialRange: DateRange | undefined = initialStartDate
    ? { from: initialStartDate, to: initialEndDate ?? undefined }
    : undefined;
  const [temporary, setTemporary] = useState<DateRange | undefined>(initialRange);
  const [applied, setApplied] = useState<DateRange | undefined>(initialRange);
  const [open, setOpen] = useState(false);

  const hasChanges =
    !sameDate(temporary?.from, applied?.from) ||
    !sameDate(temporary?.to, applied?.to);
  const hasSelection = !!temporary?.from;

  const label = temporary?.from
    ? temporary.to
      ? `${format(temporary.from, 'MMM d, yyyy')} – ${format(temporary.to, 'MMM d, yyyy')}`
      : `${format(temporary.from, 'MMM d, yyyy')} – Pick end date`
    : 'Select date range';

  const applyDates = () => {
    setApplied(temporary);
    onDateRangeChange(temporary?.from ?? null, temporary?.to ?? null);
  };

  const clearDates = () => {
    setTemporary(undefined);
    setApplied(undefined);
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
            <span className={cn(!temporary?.from && 'text-muted-foreground')}>
              {label}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            autoFocus
            mode="range"
            defaultMonth={temporary?.from}
            selected={temporary}
            onSelect={setTemporary}
            numberOfMonths={1}
          />
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
          disabled={!hasSelection || !hasChanges}
          className="flex-1"
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
