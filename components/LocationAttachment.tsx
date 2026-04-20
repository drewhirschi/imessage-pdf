'use client';

import { useEffect, useState } from 'react';
import { parseVCard, type ParsedVCard } from '@/lib/vcard/parse';

interface LocationAttachmentProps {
  attachmentId: number;
  filename: string | null;
  dbPath: string;
  attachmentsPath: string;
  isFromMe: boolean;
}

export default function LocationAttachment({
  attachmentId,
  filename,
  dbPath,
  attachmentsPath,
  isFromMe,
}: LocationAttachmentProps) {
  const [parsed, setParsed] = useState<ParsedVCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL('/api/attachments/' + attachmentId, window.location.origin);
    url.searchParams.set('dbPath', dbPath);
    url.searchParams.set('attachmentsPath', attachmentsPath);
    fetch(url.toString())
      .then(async (r) => {
        if (!r.ok) throw new Error('Failed to load location');
        return r.text();
      })
      .then((text) => {
        const result = parseVCard(text);
        if (!result) throw new Error('Could not parse location');
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
        <p className={`text-xs ${textMuted}`}>📍 {filename || 'Location'} (failed to parse)</p>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div className={`rounded-lg border p-2 ${bodyClass}`}>
        <p className={`text-xs ${textMuted}`}>Loading location…</p>
      </div>
    );
  }

  if (parsed.kind !== 'location') return null;

  const coords = `${parsed.lat.toFixed(4)}, ${parsed.lng.toFixed(4)}`;

  return (
    <div className={`rounded-lg border p-3 min-w-[220px] max-w-[320px] ${bodyClass}`}>
      <div className="flex items-start gap-2">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isFromMe ? 'bg-white bg-opacity-20' : 'bg-blue-100'
          }`}
        >
          <span>📍</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${isFromMe ? 'text-white' : 'text-gray-900'}`}>
            {parsed.label}
          </p>
          <p className={`text-xs ${textMuted}`}>{coords}</p>
          <a
            href={parsed.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-xs underline mt-1 inline-block ${
              isFromMe ? 'text-blue-100 hover:text-white' : 'text-blue-600 hover:text-blue-800'
            }`}
          >
            Open in Maps
          </a>
        </div>
      </div>
    </div>
  );
}
