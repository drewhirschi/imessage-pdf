'use client';

import { useState } from 'react';
import { format } from 'date-fns';

interface DateRangePickerProps {
  onDateRangeChange: (startDate: Date | null, endDate: Date | null) => void;
  className?: string;
}

export default function DateRangePicker({ onDateRangeChange, className = '' }: DateRangePickerProps) {
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const handleStartDateChange = (dateString: string) => {
    const date = dateString ? new Date(dateString) : null;
    setStartDate(date);
    onDateRangeChange(date, endDate);
  };

  const handleEndDateChange = (dateString: string) => {
    const date = dateString ? new Date(dateString) : null;
    setEndDate(date);
    onDateRangeChange(startDate, date);
  };

  const clearDates = () => {
    setStartDate(null);
    setEndDate(null);
    onDateRangeChange(null, null);
  };

  const formatDateForInput = (date: Date) => {
    return format(date, 'yyyy-MM-dd');
  };

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
      <h3 className="text-sm font-medium text-gray-900 mb-3">Filter by Date Range</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            id="startDate"
            value={startDate ? formatDateForInput(startDate) : ''}
            onChange={(e) => handleStartDateChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        <div>
          <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
            End Date
          </label>
          <input
            type="date"
            id="endDate"
            value={endDate ? formatDateForInput(endDate) : ''}
            onChange={(e) => handleEndDateChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
      
      {(startDate || endDate) && (
        <div className="mt-3 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {startDate && endDate && (
              <span>
                Showing messages from {format(startDate, 'MMM d, yyyy')} to {format(endDate, 'MMM d, yyyy')}
              </span>
            )}
            {startDate && !endDate && (
              <span>
                Showing messages from {format(startDate, 'MMM d, yyyy')} onwards
              </span>
            )}
            {!startDate && endDate && (
              <span>
                Showing messages up to {format(endDate, 'MMM d, yyyy')}
              </span>
            )}
          </div>
          <button
            onClick={clearDates}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
