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

export type PageSizeKey = 'Letter' | 'Legal' | 'A4' | 'A5' | 'Tabloid' | 'Custom';

const PRESETS: Record<Exclude<PageSizeKey, 'Custom'>, { w: number; h: number }> = {
  Letter: { w: 8.5, h: 11 },
  Legal: { w: 8.5, h: 14 },
  A4: { w: 8.27, h: 11.69 },
  A5: { w: 5.83, h: 8.27 },
  Tabloid: { w: 11, h: 17 },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultColumnWidthPx: number;
  onSubmit: (opts: PDFOptions) => void;
  submitting?: boolean;
}

export default function PDFOptionsDialog({
  open,
  onOpenChange,
  defaultColumnWidthPx,
  onSubmit,
  submitting,
}: Props) {
  const [pageSize, setPageSize] = useState<PageSizeKey>('Letter');
  const [customW, setCustomW] = useState<number>(8.5);
  const [customH, setCustomH] = useState<number>(11);
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
                <SelectItem value="Letter">Letter (8.5 × 11 in)</SelectItem>
                <SelectItem value="Legal">Legal (8.5 × 14 in)</SelectItem>
                <SelectItem value="A4">A4 (8.27 × 11.69 in)</SelectItem>
                <SelectItem value="A5">A5 (5.83 × 8.27 in)</SelectItem>
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
