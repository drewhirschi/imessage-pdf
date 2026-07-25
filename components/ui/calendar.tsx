"use client"

import * as React from "react"
import {
  DayPicker,
  DayFlag,
  SelectionState,
  UI,
  type DayPickerProps,
} from "react-day-picker"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

function Calendar({ className, classNames, ...props }: DayPickerProps) {
  return (
    <DayPicker
      className={cn("p-3", className)}
      classNames={{
        [UI.Months]: "flex flex-col",
        [UI.Month]: "space-y-4",
        [UI.MonthCaption]: "relative flex h-7 items-center justify-center",
        [UI.CaptionLabel]: "text-sm font-medium",
        [UI.Nav]: "absolute inset-x-3 top-3 flex items-center justify-between",
        [UI.PreviousMonthButton]:
          "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
        [UI.NextMonthButton]:
          "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
        [UI.MonthGrid]: "w-full border-collapse",
        [UI.Weekdays]: "flex",
        [UI.Weekday]:
          "w-9 text-center text-[0.75rem] font-normal text-muted-foreground",
        [UI.Week]: "mt-2 flex w-full",
        [UI.Day]: "relative size-9 p-0 text-center text-sm",
        [UI.DayButton]:
          "inline-flex size-9 items-center justify-center rounded-md font-normal hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        [DayFlag.outside]: "text-muted-foreground opacity-40",
        [DayFlag.disabled]: "text-muted-foreground opacity-40",
        [DayFlag.today]: "font-semibold text-primary",
        [SelectionState.selected]:
          "bg-primary text-primary-foreground [&>button]:hover:bg-primary",
        [SelectionState.range_start]:
          "rounded-l-md bg-primary text-primary-foreground",
        [SelectionState.range_middle]:
          "rounded-none bg-accent text-accent-foreground [&>button]:rounded-none",
        [SelectionState.range_end]:
          "rounded-r-md bg-primary text-primary-foreground",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          ),
      }}
      {...props}
    />
  )
}

Calendar.displayName = "Calendar"

export { Calendar }
