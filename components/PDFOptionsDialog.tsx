'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, LoaderCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface PDFOptions {
  pageSize: PageSizeKey;
  customWidthIn: number;
  customHeightIn: number;
  marginIn: number;
  columnWidthPx: number;
}

export interface PDFProgress {
  percent: number;
  stage: string;
  detail?: string;
  pageEstimate?: number;
  error?: boolean;
}

export type PageSizeKey = 'A5' | 'Letter' | 'Legal' | 'A4' | 'Tabloid' | 'Custom';

const PRESETS: Record<Exclude<PageSizeKey, 'Custom'>, { w: number; h: number }> = {
  A5: { w: 5.83, h: 8.27 },
  Letter: { w: 8.5, h: 11 },
  Legal: { w: 8.5, h: 14 },
  A4: { w: 8.27, h: 11.69 },
  Tabloid: { w: 11, h: 17 },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultColumnWidthPx: number;
  onSubmit: (opts: PDFOptions) => void;
  submitting?: boolean;
  progress?: PDFProgress | null;
  error?: string | null;
  totalMessages: number;
}

export default function PDFOptionsDialog({
  open,
  onOpenChange,
  defaultColumnWidthPx,
  onSubmit,
  submitting,
  progress,
  error,
  totalMessages,
}: Props) {
  const [pageSize, setPageSize] = useState<PageSizeKey>('A5');
  const [customW, setCustomW] = useState<number>(5.83);
  const [customH, setCustomH] = useState<number>(8.27);
  const [marginIn, setMarginIn] = useState<number>(0.5);
  const [columnWidthPx, setColumnWidthPx] = useState<number>(defaultColumnWidthPx);

  const submit = () => {
    onSubmit({
      pageSize,
      customWidthIn: customW,
      customHeightIn: customH,
      marginIn,
      columnWidthPx,
    });
  };
  const roughMinPages = Math.max(1, Math.ceil(totalMessages / 22));
  const roughMaxPages = Math.max(1, Math.ceil(totalMessages / 8));
  const isLargeExport = totalMessages >= 3000;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export PDF</DialogTitle>
          <DialogDescription>
            Same styling as the web view, printed as a PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Page size</Label>
            <Select
              value={pageSize}
              onValueChange={(v) => setPageSize(v as PageSizeKey)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A5">
                  A5 Print Book (5.83 × 8.27 in / 148 × 210 mm)
                </SelectItem>
                <SelectItem value="Letter">Letter (8.5 × 11 in)</SelectItem>
                <SelectItem value="Legal">Legal (8.5 × 14 in)</SelectItem>
                <SelectItem value="A4">A4 (8.27 × 11.69 in)</SelectItem>
                <SelectItem value="Tabloid">Tabloid (11 × 17 in)</SelectItem>
                <SelectItem value="Custom">Custom…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {pageSize === 'Custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="pdf-custom-w">Width (in)</Label>
                <Input
                  id="pdf-custom-w"
                  type="number"
                  step="0.1"
                  min="1"
                  value={customW}
                  onChange={(e) => setCustomW(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pdf-custom-h">Height (in)</Label>
                <Input
                  id="pdf-custom-h"
                  type="number"
                  step="0.1"
                  min="1"
                  value={customH}
                  onChange={(e) => setCustomH(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="pdf-margin">Margin (in)</Label>
            <Input
              id="pdf-margin"
              type="number"
              step="0.05"
              min="0"
              value={marginIn}
              onChange={(e) => setMarginIn(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pdf-column">Column width (px)</Label>
            <Input
              id="pdf-column"
              type="number"
              step="10"
              min="280"
              max="1200"
              value={columnWidthPx}
              onChange={(e) => setColumnWidthPx(parseInt(e.target.value, 10) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              iPhone-ish widths look best: 390–430 px.
            </p>
          </div>

          <div className="border-t pt-3 text-xs leading-5 text-muted-foreground">
            <p className="font-medium text-foreground">Print recommendation</p>
            <p>
              A5 with Color, 80# White — Coated paper, Hardcover Case Wrap,
              and a Matte Cover produced a result I really liked. I printed it
              with{' '}
              <a
                href="https://www.lulu.com/account/projects/zmewv97"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700"
              >
                Lulu
              </a>{' '}
              and had no problems with the service.
            </p>
          </div>

          <div className={`rounded-md border p-3 text-xs ${
            isLargeExport
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : 'border-gray-200 bg-gray-50 text-gray-600'
          }`}>
            <div className="flex items-start gap-2">
              {isLargeExport && <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
              <div>
                <p className="font-medium">
                  {totalMessages.toLocaleString()} messages · roughly{' '}
                  {roughMinPages.toLocaleString()}–{roughMaxPages.toLocaleString()} A5 pages
                </p>
                <p className="mt-0.5 opacity-80">
                  Images and long messages can increase the final count.
                  {isLargeExport ? ' Large books can take several minutes to render.' : ''}
                </p>
              </div>
            </div>
          </div>

          {(submitting || progress) && (
            <div className={`rounded-md border p-3 ${progress?.error ? 'border-red-300 bg-red-50' : 'border-blue-200 bg-blue-50'}`}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium text-gray-900">
                  {!progress?.error && submitting && (
                    <LoaderCircle className="size-4 animate-spin text-blue-600" />
                  )}
                  {progress?.stage ?? 'Starting export'}
                </span>
                {!progress?.error && <span className="tabular-nums text-gray-600">{progress?.percent ?? 0}%</span>}
              </div>
              {!progress?.error && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-[width] duration-300"
                    style={{ width: `${Math.max(2, progress?.percent ?? 2)}%` }}
                  />
                </div>
              )}
              {progress?.detail && (
                <p className={`mt-2 text-xs ${progress.error ? 'text-red-700' : 'text-gray-600'}`}>
                  {progress.detail}
                </p>
              )}
              {!progress?.error && submitting && (
                <p className="mt-1 text-xs text-gray-500">
                  Keep this window open. Large books may take a few minutes.
                </p>
              )}
            </div>
          )}

          {error && !progress?.error && (
            <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700">
              <p className="font-medium">Something went wrong while exporting.</p>
              <p className="mt-1 break-words">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Generating…' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function resolvePageSize(opts: PDFOptions): { width: string; height: string } {
  const { pageSize, customWidthIn, customHeightIn } = opts;
  const dim = pageSize === 'Custom'
    ? { w: customWidthIn, h: customHeightIn }
    : PRESETS[pageSize];
  return { width: `${dim.w}in`, height: `${dim.h}in` };
}
