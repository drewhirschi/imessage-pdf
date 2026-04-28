'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import PageChrome from '@/components/PageChrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
interface CoverMessageDraft {
  id: string;
  text: string;
  isFromMe: boolean;
}

interface BackImageRef {
  dataUrl: string;
  name: string;
  type: string;
}

type Binding = 'paperback' | 'hardcover' | 'custom';

const BINDING_BLEED: Record<Exclude<Binding, 'custom'>, number> = {
  paperback: 0.125,
  hardcover: 0.875,
};

// Lulu A5 hardcover defaults. The user is told to paste Lulu's exact required
// total cover dimensions (and spine) into the form; these are just sensible
// starting values so the form isn't blank.
const DEFAULT_TOTAL_W_IN = 14.035;
const DEFAULT_TOTAL_H_IN = 10.02;
const DEFAULT_SPINE_IN = 0.625;
const DEFAULT_BINDING: Binding = 'hardcover';

function newId() {
  return Math.random().toString(36).slice(2);
}

const STARTER_MESSAGES: CoverMessageDraft[] = [
  { id: newId(), text: 'The pre-dating texts of', isFromMe: true },
  { id: newId(), text: 'of Andrew and Hannah', isFromMe: false },
  { id: newId(), text: 'Hirschi', isFromMe: true },
];

// v2: lulu-spec-first model (total W / total H / spine / binding). v1 drafts
// stored trim+bleed and accidentally kept stale spine widths after we changed
// defaults — bumping the key wipes those once on first load.
const STORAGE_KEY = 'imessage-pdf:cover-draft-v2';

interface PersistedDraft {
  messages: CoverMessageDraft[];
  showTyping: boolean;
  dateValue: string;
  // Lulu cover spec — paste these directly from Lulu's upload page.
  totalWidthIn: number;
  totalHeightIn: number;
  spineWidthIn: number;
  binding: Binding;
  customBleedIn: number;
  // Front-cover layout
  marginIn: number;
  columnWidthPx: number;
  spineColor: string;
  spineText: string;
  spineTextColor: string;
  bubbleScale: number;
  backImage: BackImageRef | null;
}

function loadDraft(): Partial<PersistedDraft> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PersistedDraft>;
  } catch {
    return null;
  }
}

/**
 * Persist the draft. Returns 'ok' when fully saved, 'image-dropped' when the
 * image was too big and we saved everything else, or 'failed' on any other error.
 */
function saveDraft(draft: PersistedDraft): 'ok' | 'image-dropped' | 'failed' {
  if (typeof window === 'undefined') return 'failed';
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    return 'ok';
  } catch (err) {
    const isQuota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.code === 22);
    if (isQuota && draft.backImage) {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...draft, backImage: null }),
        );
        return 'image-dropped';
      } catch {
        return 'failed';
      }
    }
    return 'failed';
  }
}

function clearDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export default function CoverPage() {
  return (
    <PageChrome>
      <CoverForm />
    </PageChrome>
  );
}

function CoverForm() {
  const [messages, setMessages] = useState<CoverMessageDraft[]>(STARTER_MESSAGES);
  const [showTyping, setShowTyping] = useState(true);
  const [dateValue, setDateValue] = useState<string>(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return format(d, "yyyy-MM-dd'T'HH:mm");
  });
  const [totalWidthIn, setTotalWidthIn] = useState(DEFAULT_TOTAL_W_IN);
  const [totalHeightIn, setTotalHeightIn] = useState(DEFAULT_TOTAL_H_IN);
  const [spineWidthIn, setSpineWidthIn] = useState(DEFAULT_SPINE_IN);
  const [binding, setBinding] = useState<Binding>(DEFAULT_BINDING);
  const [customBleedIn, setCustomBleedIn] = useState(0.125);
  const [marginIn, setMarginIn] = useState(0.5);
  const [columnWidthPx, setColumnWidthPx] = useState(390);
  const [spineColor, setSpineColor] = useState('#ffffff');
  const [spineText, setSpineText] = useState('');
  const [spineTextColor, setSpineTextColor] = useState('#1c1c1e');
  const [bubbleScale, setBubbleScale] = useState(1);
  const [backImage, setBackImage] = useState<BackImageRef | null>(null);
  const [draftStatus, setDraftStatus] = useState<
    'idle' | 'saved' | 'image-dropped' | 'failed'
  >('idle');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hydratedRef = useRef(false);

  // Hydrate from localStorage on first mount.
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      if (Array.isArray(draft.messages) && draft.messages.length > 0) {
        setMessages(draft.messages);
      }
      if (typeof draft.showTyping === 'boolean') setShowTyping(draft.showTyping);
      if (typeof draft.dateValue === 'string') setDateValue(draft.dateValue);

      if (Number.isFinite(draft.totalWidthIn)) {
        setTotalWidthIn(draft.totalWidthIn as number);
      }
      if (Number.isFinite(draft.totalHeightIn)) {
        setTotalHeightIn(draft.totalHeightIn as number);
      }
      if (
        draft.binding === 'paperback' ||
        draft.binding === 'hardcover' ||
        draft.binding === 'custom'
      ) {
        setBinding(draft.binding);
      }
      if (Number.isFinite(draft.customBleedIn)) {
        setCustomBleedIn(draft.customBleedIn as number);
      }
      if (Number.isFinite(draft.marginIn)) setMarginIn(draft.marginIn as number);
      if (Number.isFinite(draft.columnWidthPx)) {
        setColumnWidthPx(draft.columnWidthPx as number);
      }
      if (Number.isFinite(draft.spineWidthIn)) {
        setSpineWidthIn(draft.spineWidthIn as number);
      }
      if (typeof draft.spineColor === 'string') setSpineColor(draft.spineColor);
      if (typeof draft.spineText === 'string') setSpineText(draft.spineText);
      if (typeof draft.spineTextColor === 'string') {
        setSpineTextColor(draft.spineTextColor);
      }
      if (Number.isFinite(draft.bubbleScale)) {
        setBubbleScale(draft.bubbleScale as number);
      }
      if (draft.backImage && typeof draft.backImage.dataUrl === 'string') {
        setBackImage(draft.backImage);
      }
    }
    hydratedRef.current = true;
  }, []);

  // Persist on every change once hydrated.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const result = saveDraft({
      messages,
      showTyping,
      dateValue,
      totalWidthIn,
      totalHeightIn,
      spineWidthIn,
      binding,
      customBleedIn,
      marginIn,
      columnWidthPx,
      spineColor,
      spineText,
      spineTextColor,
      bubbleScale,
      backImage,
    });
    setDraftStatus(result === 'ok' ? 'saved' : result);
  }, [
    messages,
    showTyping,
    dateValue,
    totalWidthIn,
    totalHeightIn,
    spineWidthIn,
    binding,
    customBleedIn,
    marginIn,
    columnWidthPx,
    spineColor,
    spineText,
    spineTextColor,
    bubbleScale,
    backImage,
  ]);

  // Lulu spec is the source of truth: total cover dimensions + spine width
  // are typed in directly from the upload page. Bleed comes from the binding
  // type. Trim per face is the leftover after spine and bleed.
  const bleedIn = useMemo(
    () =>
      binding === 'custom'
        ? customBleedIn
        : BINDING_BLEED[binding],
    [binding, customBleedIn],
  );
  const trim = useMemo(() => {
    const faceW = (totalWidthIn - spineWidthIn) / 2;
    return {
      w: faceW - bleedIn,
      h: totalHeightIn - 2 * bleedIn,
      bleed: bleedIn,
    };
  }, [totalWidthIn, totalHeightIn, spineWidthIn, bleedIn]);
  const trimValid = trim.w > 0 && trim.h > 0;

  const dateLabel = useMemo(() => {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '';
    return format(d, "MMM d, yyyy, h:mm a");
  }, [dateValue]);

  const updateMessage = (id: string, patch: Partial<CoverMessageDraft>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };
  const removeMessage = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };
  const addMessage = (isFromMe: boolean) => {
    setMessages((prev) => [...prev, { id: newId(), text: '', isFromMe }]);
  };
  const moveMessage = (id: string, dir: -1 | 1) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx === -1) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  };

  const onFile = async (file: File | null) => {
    if (!file) {
      setBackImage(null);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setBackImage({ dataUrl, name: file.name, type: file.type || 'image/jpeg' });
    } catch {
      setError('Could not read the selected image.');
    }
  };

  const handleClearDraft = () => {
    clearDraft();
    setMessages(STARTER_MESSAGES);
    setShowTyping(true);
    const d = new Date();
    d.setSeconds(0, 0);
    setDateValue(format(d, "yyyy-MM-dd'T'HH:mm"));
    setTotalWidthIn(DEFAULT_TOTAL_W_IN);
    setTotalHeightIn(DEFAULT_TOTAL_H_IN);
    setSpineWidthIn(DEFAULT_SPINE_IN);
    setBinding(DEFAULT_BINDING);
    setCustomBleedIn(0.125);
    setMarginIn(0.5);
    setColumnWidthPx(390);
    setSpineColor('#ffffff');
    setSpineText('');
    setSpineTextColor('#1c1c1e');
    setBubbleScale(1);
    setBackImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setError(null);
  };

  const submit = async () => {
    setError(null);
    const cleaned = messages
      .map((m) => ({ text: m.text.trim(), isFromMe: m.isFromMe }))
      .filter((m) => m.text.length > 0);
    if (cleaned.length === 0 && !showTyping) {
      setError('Add at least one message or enable the typing indicator.');
      return;
    }

    const spec = {
      dateLabel,
      messages: cleaned,
      showTypingIndicator: showTyping,
      trimWidthIn: trim.w,
      trimHeightIn: trim.h,
      spineWidthIn,
      bleedIn,
      spineColor,
      spineText,
      spineTextColor,
      marginIn,
      columnWidthPx,
      bubbleScale,
    };

    const fd = new FormData();
    fd.set('spec', JSON.stringify(spec));
    if (backImage) {
      const blob = await dataUrlToBlob(backImage.dataUrl);
      fd.set('backImage', blob, backImage.name || 'back.jpg');
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/generate-cover', { method: 'POST', body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `Server returned ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cover-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate cover');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Cover generator</h2>
          <p className="text-sm text-gray-600 mt-1">
            Front cover with iMessage-style bubbles, back cover from an uploaded image.
            Drafts auto-save to this browser.
          </p>
        </div>
        <Link href="/" className="text-sm text-blue-600 hover:text-blue-800 underline">
          ← Home
        </Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left column — form */}
        <div className="space-y-6">
          <Card title="Header">
            <div className="grid gap-2">
              <Label htmlFor="cover-date">Date &amp; time (top of front cover)</Label>
              <Input
                id="cover-date"
                type="datetime-local"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
              />
              {dateLabel && (
                <p className="text-xs text-muted-foreground">
                  Renders as <span className="font-medium">{dateLabel}</span>
                </p>
              )}
            </div>
          </Card>

          <Card title="Messages">
            <div className="space-y-2">
              {messages.map((m, i) => (
                <div
                  key={m.id}
                  className="flex items-start gap-2 border border-gray-200 rounded-md p-2"
                >
                  <div className="flex flex-col gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => moveMessage(m.id, -1)}
                      disabled={i === 0}
                      className="text-xs px-1 text-gray-500 hover:text-gray-900 disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMessage(m.id, 1)}
                      disabled={i === messages.length - 1}
                      className="text-xs px-1 text-gray-500 hover:text-gray-900 disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      value={m.text}
                      onChange={(e) => updateMessage(m.id, { text: e.target.value })}
                      placeholder="Message text"
                    />
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 text-xs text-gray-700">
                        <input
                          type="radio"
                          name={`side-${m.id}`}
                          checked={m.isFromMe}
                          onChange={() => updateMessage(m.id, { isFromMe: true })}
                        />
                        Right (me)
                      </label>
                      <label className="flex items-center gap-1 text-xs text-gray-700">
                        <input
                          type="radio"
                          name={`side-${m.id}`}
                          checked={!m.isFromMe}
                          onChange={() => updateMessage(m.id, { isFromMe: false })}
                        />
                        Left (them)
                      </label>
                      <button
                        type="button"
                        onClick={() => removeMessage(m.id)}
                        className="ml-auto text-xs text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => addMessage(true)}>
                  + Right bubble
                </Button>
                <Button type="button" variant="outline" onClick={() => addMessage(false)}>
                  + Left bubble
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 mt-2">
                <input
                  type="checkbox"
                  checked={showTyping}
                  onChange={(e) => setShowTyping(e.target.checked)}
                />
                Trailing typing indicator (the gray “…” bubble)
              </label>
            </div>
          </Card>

          <Card title="Cover dimensions (paste from Lulu's upload page)">
            <div className="grid gap-3">
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                Lulu&apos;s &ldquo;Upload Your Cover&rdquo; page lists three
                exact numbers (total width, total height, spine width). Paste
                them here. The PDF will be generated at exactly these
                dimensions and the API double-checks the MediaBox before
                returning.
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="cover-total-w">Total width (in)</Label>
                  <Input
                    id="cover-total-w"
                    type="number"
                    step="0.001"
                    min="0"
                    value={totalWidthIn}
                    onChange={(e) =>
                      setTotalWidthIn(parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cover-total-h">Total height (in)</Label>
                  <Input
                    id="cover-total-h"
                    type="number"
                    step="0.001"
                    min="0"
                    value={totalHeightIn}
                    onChange={(e) =>
                      setTotalHeightIn(parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cover-spine">Spine width (in)</Label>
                  <Input
                    id="cover-spine"
                    type="number"
                    step="0.001"
                    min="0"
                    value={spineWidthIn}
                    onChange={(e) =>
                      setSpineWidthIn(parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Binding (sets safe-zone bleed/wrap)</Label>
                <div className="flex items-center gap-3 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="binding"
                      checked={binding === 'paperback'}
                      onChange={() => setBinding('paperback')}
                    />
                    Paperback (0.125&quot; bleed)
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="binding"
                      checked={binding === 'hardcover'}
                      onChange={() => setBinding('hardcover')}
                    />
                    Hardcover casewrap (0.875&quot; wrap)
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="binding"
                      checked={binding === 'custom'}
                      onChange={() => setBinding('custom')}
                    />
                    Custom
                  </label>
                </div>
                {binding === 'custom' && (
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={customBleedIn}
                    onChange={(e) =>
                      setCustomBleedIn(parseFloat(e.target.value) || 0)
                    }
                    placeholder="Custom bleed (in)"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="cover-spine-color">Spine color</Label>
                  <Input
                    id="cover-spine-color"
                    type="color"
                    value={spineColor}
                    onChange={(e) => setSpineColor(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cover-spine-text-color">Spine text color</Label>
                  <Input
                    id="cover-spine-text-color"
                    type="color"
                    value={spineTextColor}
                    onChange={(e) => setSpineTextColor(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cover-spine-text">Spine text (optional)</Label>
                <Input
                  id="cover-spine-text"
                  type="text"
                  placeholder="e.g. The pre-dating texts of Andrew & Hannah"
                  value={spineText}
                  onChange={(e) => setSpineText(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="cover-margin">Front margin (in)</Label>
                  <Input
                    id="cover-margin"
                    type="number"
                    step="0.05"
                    min="0"
                    value={marginIn}
                    onChange={(e) => setMarginIn(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cover-col">Bubble column (px)</Label>
                  <Input
                    id="cover-col"
                    type="number"
                    step="10"
                    min="240"
                    max="900"
                    value={columnWidthPx}
                    onChange={(e) => setColumnWidthPx(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cover-bubble-scale">Bubble scale</Label>
                  <Input
                    id="cover-bubble-scale"
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="6"
                    value={bubbleScale}
                    onChange={(e) =>
                      setBubbleScale(parseFloat(e.target.value) || 1)
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    1 = native iMessage. 2 = double size, etc.
                  </p>
                </div>
              </div>

              <div
                className={`rounded-md p-3 text-xs space-y-1 ${
                  trimValid
                    ? 'bg-gray-50 border border-gray-200 text-gray-700'
                    : 'bg-red-50 border border-red-300 text-red-800'
                }`}
              >
                <div className="font-semibold">
                  PDF will be generated at exactly:
                </div>
                <div className="font-mono text-base">
                  {totalWidthIn.toFixed(3)} × {totalHeightIn.toFixed(3)} in
                </div>
                <div className="text-gray-500">
                  Visible front cover (after trim): {Math.max(0, trim.w).toFixed(3)} ×{' '}
                  {Math.max(0, trim.h).toFixed(3)} in · spine{' '}
                  {spineWidthIn.toFixed(3)} in · bleed/wrap {bleedIn.toFixed(3)} in
                </div>
                {!trimValid && (
                  <div className="text-red-700">
                    Trim works out negative — spine + bleed are bigger than the
                    cover. Double-check the numbers.
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card title="Back cover image">
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="text-xs text-muted-foreground">
                Image fills the back cover with <code>object-fit: cover</code>.
                Leave empty for a blank back.
              </p>
              {backImage && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 truncate">
                    Saved: {backImage.name}
                  </span>
                  <button
                    type="button"
                    className="text-red-600 hover:text-red-800"
                    onClick={() => {
                      onFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    Remove image
                  </button>
                </div>
              )}
              {draftStatus === 'image-dropped' && (
                <p className="text-xs text-amber-700">
                  Image is too large to save in your browser — it&apos;ll work for
                  this PDF, but won&apos;t survive a refresh. Pick a smaller file
                  to keep it across sessions.
                </p>
              )}
            </div>
          </Card>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <Button
            onClick={submit}
            disabled={submitting || !trimValid}
            className="w-full"
          >
            {submitting ? 'Generating…' : 'Generate cover PDF'}
          </Button>

          <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
            <span>
              {draftStatus === 'saved' && 'Draft saved to this browser.'}
              {draftStatus === 'image-dropped' &&
                'Draft saved (image not persisted).'}
              {draftStatus === 'failed' && 'Could not save draft.'}
              {draftStatus === 'idle' && ' '}
            </span>
            <button
              type="button"
              className="text-red-600 hover:text-red-800"
              onClick={handleClearDraft}
            >
              Clear draft
            </button>
          </div>
        </div>

        {/* Right column — preview */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Preview (single-page spread)
          </h3>
          <div className="bg-gray-100 rounded-lg p-4">
            <SpreadPreview
              dateLabel={dateLabel}
              messages={messages.filter((m) => m.text.trim())}
              showTyping={showTyping}
              marginIn={marginIn}
              trimWidthIn={trim.w}
              trimHeightIn={trim.h}
              spineWidthIn={spineWidthIn}
              bleedIn={bleedIn}
              spineColor={spineColor}
              spineText={spineText}
              spineTextColor={spineTextColor}
              columnWidthPx={columnWidthPx}
              bubbleScale={bubbleScale}
              backImageDataUrl={backImage?.dataUrl ?? null}
            />
            <p className="text-xs text-center text-gray-500 mt-2">
              Back · Spine · Front (left to right when laid flat)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">{title}</h3>
      {children}
    </section>
  );
}

interface SpreadPreviewProps {
  dateLabel: string;
  messages: CoverMessageDraft[];
  showTyping: boolean;
  marginIn: number;
  trimWidthIn: number;
  trimHeightIn: number;
  spineWidthIn: number;
  bleedIn: number;
  spineColor: string;
  spineText: string;
  spineTextColor: string;
  columnWidthPx: number;
  bubbleScale: number;
  backImageDataUrl: string | null;
}

function SpreadPreview(props: SpreadPreviewProps) {
  const {
    dateLabel,
    messages,
    showTyping,
    marginIn,
    trimWidthIn,
    trimHeightIn,
    spineWidthIn,
    bleedIn,
    spineColor,
    spineText,
    spineTextColor,
    columnWidthPx,
    bubbleScale,
    backImageDataUrl,
  } = props;

  const totalW = trimWidthIn * 2 + spineWidthIn + bleedIn * 2;
  const totalH = trimHeightIn + bleedIn * 2;
  const backFaceW = trimWidthIn + bleedIn;
  const frontFaceW = trimWidthIn + bleedIn;

  // Trim guide lines (where the cover gets cut). All offsets in % of total.
  const leftTrimPct = (bleedIn / totalW) * 100;
  const spineLeftPct = (backFaceW / totalW) * 100;
  const spineRightPct = ((backFaceW + spineWidthIn) / totalW) * 100;
  const rightTrimPct = ((totalW - bleedIn) / totalW) * 100;
  const topTrimPct = (bleedIn / totalH) * 100;
  const bottomTrimPct = ((totalH - bleedIn) / totalH) * 100;

  const parts = dateLabel ? dateLabel.split(/,\s*(?=\d{1,2}:\d{2})/) : [];
  const datePart = parts[0] ?? dateLabel;
  const timePart = parts[1] ?? '';
  // Column width (scaled) as a fraction of front face's trim width.
  const colPct = Math.min(
    100,
    ((columnWidthPx * bubbleScale) / (trimWidthIn * 96)) * 100,
  );
  // Preview is rendered tiny; scale tunes proportionally with bubbleScale.
  const fs = 6 * bubbleScale;
  const r = 8 * bubbleScale;
  const tail = 2 * bubbleScale;

  return (
    <div
      className="shadow mx-auto bg-white relative"
      style={{
        aspectRatio: `${totalW} / ${totalH}`,
        width: '100%',
      }}
    >
      <div className="absolute inset-0 flex">
        {/* BACK */}
        <div
          className="relative overflow-hidden bg-black"
          style={{ width: `${(backFaceW / totalW) * 100}%`, height: '100%' }}
        >
          {backImageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={backImageDataUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-white" />
          )}
        </div>

        {/* SPINE */}
        <div
          className="relative overflow-hidden"
          style={{
            width: `${(spineWidthIn / totalW) * 100}%`,
            height: '100%',
            backgroundColor: spineColor,
          }}
        >
          {spineText && spineWidthIn > 0.05 && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%) rotate(-90deg)',
                whiteSpace: 'nowrap',
                color: spineTextColor,
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
            >
              {spineText}
            </div>
          )}
        </div>

        {/* FRONT */}
        <div
          className="relative overflow-hidden bg-white"
          style={{
            width: `${(frontFaceW / totalW) * 100}%`,
            height: '100%',
            paddingTop: `${((bleedIn + marginIn) / totalH) * 100}%`,
            paddingBottom: `${((bleedIn + marginIn) / totalH) * 100}%`,
            paddingLeft: `${(marginIn / frontFaceW) * 100}%`,
            paddingRight: `${((bleedIn + marginIn) / frontFaceW) * 100}%`,
            boxSizing: 'border-box',
          }}
        >
          <div
            className="mx-auto w-full"
            style={{ maxWidth: `${colPct}%` }}
          >
            {datePart && (
              <div
                className="text-center text-[#8E8E93]"
                style={{ fontSize: 7 * bubbleScale }}
              >
                <span className="text-[#1c1c1e] font-semibold">{datePart}</span>
                {timePart && `, ${timePart}`}
              </div>
            )}
            <div className="mt-2 space-y-0.5">
              {messages.map((m, i) => {
                const next = messages[i + 1];
                const isLastOfRun = !next || next.isFromMe !== m.isFromMe;
                return (
                  <div
                    key={m.id}
                    className={`flex ${m.isFromMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] leading-tight ${
                        m.isFromMe
                          ? 'bg-[#007AFF] text-white'
                          : 'bg-[#E9E9EB] text-black'
                      }`}
                      style={{
                        fontSize: fs,
                        padding: `${1 * bubbleScale}px ${3 * bubbleScale}px`,
                        borderRadius: r,
                        borderBottomRightRadius:
                          m.isFromMe && isLastOfRun ? tail : r,
                        borderBottomLeftRadius:
                          !m.isFromMe && isLastOfRun ? tail : r,
                      }}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })}
              {showTyping && (
                <div className="flex justify-start">
                  <div
                    className="bg-[#E9E9EB] flex items-center"
                    style={{
                      padding: `${2 * bubbleScale}px ${4 * bubbleScale}px`,
                      borderRadius: r,
                      borderBottomLeftRadius: tail,
                      gap: 1 * bubbleScale,
                    }}
                  >
                    <span
                      className="rounded-full bg-[#A8A8AD]"
                      style={{ width: 2 * bubbleScale, height: 2 * bubbleScale }}
                    />
                    <span
                      className="rounded-full bg-[#A8A8AD]"
                      style={{ width: 2 * bubbleScale, height: 2 * bubbleScale }}
                    />
                    <span
                      className="rounded-full bg-[#A8A8AD]"
                      style={{ width: 2 * bubbleScale, height: 2 * bubbleScale }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Trim guides — dashed lines marking where the printer will cut. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{ outline: '1px dashed rgba(239, 68, 68, 0.6)', outlineOffset: '-1px' }}
      >
        {/* Vertical trim lines */}
        <div
          className="absolute top-0 bottom-0 border-l border-dashed border-red-400/70"
          style={{ left: `${leftTrimPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 border-l border-dashed border-red-400/70"
          style={{ left: `${rightTrimPct}%` }}
        />
        {/* Spine fold lines */}
        <div
          className="absolute top-0 bottom-0 border-l border-dashed border-blue-400/70"
          style={{ left: `${spineLeftPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 border-l border-dashed border-blue-400/70"
          style={{ left: `${spineRightPct}%` }}
        />
        {/* Horizontal trim lines */}
        <div
          className="absolute left-0 right-0 border-t border-dashed border-red-400/70"
          style={{ top: `${topTrimPct}%` }}
        />
        <div
          className="absolute left-0 right-0 border-t border-dashed border-red-400/70"
          style={{ top: `${bottomTrimPct}%` }}
        />
      </div>
    </div>
  );
}

