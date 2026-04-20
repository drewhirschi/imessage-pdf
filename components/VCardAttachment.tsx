'use client';

import { useEffect, useState } from 'react';
import { parseVCard, type ParsedVCard } from '@/lib/vcard/parse';
import { useContactsOptional } from './ContactsProvider';

interface VCardAttachmentProps {
  attachmentId: number;
  filename: string | null;
  dbPath: string;
  attachmentsPath: string;
  isFromMe: boolean;
}

export default function VCardAttachment({
  attachmentId,
  filename,
  dbPath,
  attachmentsPath,
  isFromMe,
}: VCardAttachmentProps) {
  const [parsed, setParsed] = useState<ParsedVCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contacts = useContactsOptional();

  useEffect(() => {
    const url = new URL('/api/attachments/' + attachmentId, window.location.origin);
    url.searchParams.set('dbPath', dbPath);
    url.searchParams.set('attachmentsPath', attachmentsPath);
    fetch(url.toString())
      .then(async (r) => {
        if (!r.ok) throw new Error('Failed to load vcard');
        return r.text();
      })
      .then((text) => {
        const result = parseVCard(text);
        if (!result) throw new Error('Could not parse vCard');
        setParsed(result);
      })
      .catch((err: Error) => setError(err.message));
  }, [attachmentId, dbPath, attachmentsPath]);

  const bodyClass = isFromMe
    ? 'bg-white bg-opacity-10 border-white border-opacity-20'
    : 'bg-white border-gray-200';
  const textMuted = isFromMe ? 'text-blue-100' : 'text-gray-600';

  if (error) {
    return (
      <div className={`rounded-lg border p-2 ${bodyClass}`}>
        <p className={`text-xs ${textMuted}`}>📇 {filename || 'Contact'} (failed to parse)</p>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div className={`rounded-lg border p-2 ${bodyClass}`}>
        <p className={`text-xs ${textMuted}`}>Loading contact…</p>
      </div>
    );
  }

  if (parsed.kind !== 'contact') return null;

  const initials = (parsed.fn || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

  const primaryPhone = parsed.tel[0]?.number ?? null;

  async function addToContacts() {
    if (!contacts || !primaryPhone || !parsed || parsed.kind !== 'contact' || !parsed.fn) return;
    await contacts.setName(primaryPhone, parsed.fn);
  }

  const alreadyInBook =
    !!contacts && !!primaryPhone && !!contacts.resolve(primaryPhone);

  return (
    <div className={`rounded-lg border p-3 min-w-[220px] max-w-[320px] ${bodyClass}`}>
      <div className="flex items-start gap-3">
        {parsed.photoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={parsed.photoDataUrl}
            alt={parsed.fn ?? 'Contact'}
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold ${
              isFromMe ? 'bg-white text-blue-600' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${isFromMe ? 'text-white' : 'text-gray-900'}`}>
            {parsed.fn || 'Contact'}
          </p>
          {parsed.org && (
            <p className={`text-xs truncate ${textMuted}`}>{parsed.org}</p>
          )}
        </div>
      </div>
      {(parsed.tel.length > 0 || parsed.email.length > 0) && (
        <div className={`mt-2 space-y-1 text-xs ${textMuted}`}>
          {parsed.tel.map((t, i) => (
            <div key={`tel-${i}`} className="flex items-center gap-2">
              <span className="opacity-60 uppercase text-[10px]">
                {t.type ?? 'tel'}
              </span>
              <a
                href={`tel:${t.number.replace(/\s+/g, '')}`}
                className={`hover:underline ${isFromMe ? 'text-white' : 'text-blue-600'}`}
              >
                {t.number}
              </a>
            </div>
          ))}
          {parsed.email.map((e, i) => (
            <div key={`mail-${i}`} className="flex items-center gap-2">
              <span className="opacity-60 uppercase text-[10px]">email</span>
              <a
                href={`mailto:${e}`}
                className={`hover:underline truncate ${isFromMe ? 'text-white' : 'text-blue-600'}`}
              >
                {e}
              </a>
            </div>
          ))}
        </div>
      )}
      {contacts && primaryPhone && parsed.fn && !alreadyInBook && (
        <button
          type="button"
          onClick={addToContacts}
          className={`mt-2 text-[11px] underline ${
            isFromMe ? 'text-blue-100 hover:text-white' : 'text-blue-600 hover:text-blue-800'
          }`}
        >
          Save to contacts book
        </button>
      )}
    </div>
  );
}
