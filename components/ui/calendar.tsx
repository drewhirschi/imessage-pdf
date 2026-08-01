"use client"

import * as React from "react"
import {
  DayPicker,
  DayFlag,
  SelectionState,
  UI,
  type DayPickerProps,
} from "react-day-picker"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

function Calendar({ className, classNames, ...props }: DayPickerProps) {
  const usesDropdownCaption = props.captionLayout?.startsWith("dropdown") ?? false
  return (
    <DayPicker
      className={cn("relative p-3", className)}
      classNames={{
        [UI.Months]: "flex flex-col gap-4 sm:flex-row",
        [UI.Month]: "space-y-4",
        [UI.MonthCaption]: "relative flex h-7 items-center justify-center",
        [UI.CaptionLabel]: usesDropdownCaption ? "hidden" : "text-sm font-medium",
        [UI.Dropdowns]: "flex w-[164px] items-center justify-center gap-2",
        [UI.DropdownRoot]: "relative w-[78px] rounded-md border bg-background",
        [UI.Dropdown]: "h-7 w-full cursor-pointer bg-transparent px-2 text-xs font-medium outline-none",
        [UI.Nav]: "absolute inset-x-3 top-3 z-10 flex items-center justify-between pointer-events-none",
        [UI.PreviousMonthButton]:
          "pointer-events-auto inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
        [UI.NextMonthButton]:
          "pointer-events-auto inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
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
        Chevron: ({ orientation, className }) => {
          const Icon = orientation === "left"
            ? ChevronLeft
            : orientation === "down"
              ? ChevronDown
              : ChevronRight
          return <Icon className={cn("size-4", className)} />
        },
      }}
      {...props}
    />
  )
}

Calendar.displayName = "Calendar"

export { Calendar }
