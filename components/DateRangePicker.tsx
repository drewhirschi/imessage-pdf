'use client';

import { useState } from 'react';
import { format } from 'date-fns';

interface DateRangePickerProps {
  onDateRangeChange: (startDate: Date | null, endDate: Date | null) => void;
  className?: string;
  initialStartDate?: Date | null;
  initialEndDate?: Date | null;
}

export default function DateRangePicker({ 
  onDateRangeChange, 
  className = '',
  initialStartDate = null,
  initialEndDate = null 
}: DateRangePickerProps) {
  // Temporary state for date inputs (not yet applied)
  const [tempStartDate, setTempStartDate] = useState<Date | null>(initialStartDate);
  const [tempEndDate, setTempEndDate] = useState<Date | null>(initialEndDate);
  
  // Applied state (what's actually being used for filtering)
  const [appliedStartDate, setAppliedStartDate] = useState<Date | null>(initialStartDate);
  const [appliedEndDate, setAppliedEndDate] = useState<Date | null>(initialEndDate);

  const handleStartDateChange = (dateString: string) => {
    if (!dateString) {
      setTempStartDate(null);
      return;
    }
    
    // Create date at start of day in local timezone
    const date = new Date(dateString + 'T00:00:00');
    setTempStartDate(date);
  };

  const handleEndDateChange = (dateString: string) => {
    if (!dateString) {
      setTempEndDate(null);
      return;
    }
    
    // Create date at start of day in local timezone (will be adjusted to end of day in the API call)
    const date = new Date(dateString + 'T00:00:00');
    setTempEndDate(date);
  };

  const applyDates = () => {
    setAppliedStartDate(tempStartDate);
    setAppliedEndDate(tempEndDate);
    onDateRangeChange(tempStartDate, tempEndDate);
  };

  const clearDates = () => {
    setTempStartDate(null);
    setTempEndDate(null);
    setAppliedStartDate(null);
    setAppliedEndDate(null);
    onDateRangeChange(null, null);
  };
  
  const hasChanges = tempStartDate !== appliedStartDate || tempEndDate !== appliedEndDate;
  const hasSelection = tempStartDate !== null || tempEndDate !== null;

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
            value={tempStartDate ? formatDateForInput(tempStartDate) : ''}
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
            value={tempEndDate ? formatDateForInput(tempEndDate) : ''}
            onChange={(e) => handleEndDateChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
      
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex-1">
          {appliedStartDate || appliedEndDate ? (
            <div className="text-sm text-gray-600">
              {appliedStartDate && appliedEndDate && (
                <span>
                  Showing messages from {format(appliedStartDate, 'MMM d, yyyy')} to {format(appliedEndDate, 'MMM d, yyyy')}
                </span>
              )}
              {appliedStartDate && !appliedEndDate && (
                <span>
                  Showing messages from {format(appliedStartDate, 'MMM d, yyyy')} onwards
                </span>
              )}
              {!appliedStartDate && appliedEndDate && (
                <span>
                  Showing messages up to {format(appliedEndDate, 'MMM d, yyyy')}
                </span>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              Showing all messages
            </div>
          )}
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={clearDates}
            disabled={!hasSelection}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
          <button
            onClick={applyDates}
            disabled={!hasSelection || !hasChanges}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Apply Filter
          </button>
        </div>
      </div>
    </div>
  );
}
