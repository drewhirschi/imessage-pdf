'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { imessageToDate } from '@/lib/utils/timestamp';
import type { Contact, ContactsBook } from '@/lib/contacts/types';
import PageChrome from '@/components/PageChrome';

interface HandleRow {
  id: string;
  service: string | null;
  message_count: number;
  last_seen: number | null;
}

function ContactsEditor() {
  const searchParams = useSearchParams();
  const urlDbPath = searchParams.get('dbPath') || '';
  const urlContactsPath = searchParams.get('contactsPath') || '';

  const [dbPath, setDbPath] = useState(urlDbPath);
  const [contactsPath, setContactsPath] = useState(urlContactsPath);
  const [handles, setHandles] = useState<HandleRow[]>([]);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showOnlyUnresolved, setShowOnlyUnresolved] = useState(false);
  const [saveState, setSaveState] = useState<Record<string, 'saving' | 'saved'>>({});

  useEffect(() => {
    if (!dbPath) {
      const fromStorage = localStorage.getItem('imessage-db-path');
      if (fromStorage) setDbPath(fromStorage);
    }
    if (!contactsPath) {
      const fromStorage = localStorage.getItem('imessage-contacts-path');
      if (fromStorage) setContactsPath(fromStorage);
    }
  }, [dbPath, contactsPath]);

  const load = useCallback(async () => {
    if (!dbPath || !contactsPath) return;
    setLoading(true);
    setError(null);
    try {
      const [handlesRes, bookRes] = await Promise.all([
        fetch(`/api/handles?dbPath=${encodeURIComponent(dbPath)}`),
        fetch(`/api/contacts?path=${encodeURIComponent(contactsPath)}`),
      ]);
      if (!handlesRes.ok) throw new Error('Failed to load handles');
      if (!bookRes.ok) throw new Error('Failed to load contacts');
      const handlesData = (await handlesRes.json()) as { handles: HandleRow[] };
      const book = (await bookRes.json()) as ContactsBook;
      setHandles(handlesData.handles);
      setContacts(book.contacts ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [dbPath, contactsPath]);

  useEffect(() => {
    load();
  }, [load]);

  const saveOne = useCallback(
    async (handleId: string, name: string) => {
      setSaveState((s) => ({ ...s, [handleId]: 'saving' }));
      setContacts((prev) => {
        const next = { ...prev };
        if (!name.trim()) delete next[handleId];
        else next[handleId] = { ...next[handleId], name: name.trim() };
        return next;
      });
      try {
        await fetch(`/api/contacts?path=${encodeURIComponent(contactsPath)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handleId, name }),
        });
        setSaveState((s) => ({ ...s, [handleId]: 'saved' }));
        setTimeout(() => {
          setSaveState((s) => {
            const { [handleId]: _, ...rest } = s;
            return rest;
          });
        }, 1200);
      } catch (err) {
        console.error(err);
        setError('Failed to save');
      }
    },
    [contactsPath],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return handles.filter((h) => {
      const hasName = !!contacts[h.id]?.name;
      if (showOnlyUnresolved && hasName) return false;
      if (!q) return true;
      const name = contacts[h.id]?.name ?? '';
      return (
        h.id.toLowerCase().includes(q) || name.toLowerCase().includes(q)
      );
    });
  }, [handles, contacts, query, showOnlyUnresolved]);

  const resolvedCount = handles.filter((h) => !!contacts[h.id]?.name).length;

  if (!dbPath || !contactsPath) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Contacts Book</h1>
        <p className="text-gray-600 mb-4">
          Configure your database and contacts file paths first.
        </p>
        <Link href="/" className="text-blue-600 hover:text-blue-800 underline">
          ← Back to configuration
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Contacts Book</h1>
          <p className="text-sm text-gray-600 mt-1">
            {resolvedCount} of {handles.length} handles named. File:{' '}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{contactsPath}</code>
          </p>
        </div>
        <Link href="/" className="text-sm text-blue-600 hover:text-blue-800 underline">
          ← Back
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search handles or names…"
          className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showOnlyUnresolved}
            onChange={(e) => setShowOnlyUnresolved(e.target.checked)}
            className="rounded"
          />
          Only unnamed
        </label>
        <button
          type="button"
          onClick={load}
          className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          Reload
        </button>
      </div>

      {loading && <p className="text-gray-600">Loading…</p>}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Handle</th>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-right px-4 py-2 font-medium w-28">Messages</th>
                <th className="text-right px-4 py-2 font-medium w-40">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => (
                <HandleRowEditor
                  key={h.id}
                  handle={h}
                  currentName={contacts[h.id]?.name ?? ''}
                  onSave={(name) => saveOne(h.id, name)}
                  saveStatus={saveState[h.id]}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-gray-500 py-8">
                    No handles match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HandleRowEditor({
  handle,
  currentName,
  onSave,
  saveStatus,
}: {
  handle: HandleRow;
  currentName: string;
  onSave: (name: string) => void;
  saveStatus?: 'saving' | 'saved';
}) {
  const [value, setValue] = useState(currentName);

  useEffect(() => {
    setValue(currentName);
  }, [currentName]);

  const dirty = value !== currentName;

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-2 font-mono text-xs text-gray-700 break-all">
        {handle.id}
      </td>
      <td className="px-4 py-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(value);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
              if (dirty) onSave(value);
            }}
            placeholder="—"
            className="flex-1 px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
          />
          {saveStatus === 'saving' && (
            <span className="text-xs text-gray-400">saving…</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-green-600">saved</span>
          )}
        </form>
      </td>
      <td className="px-4 py-2 text-right text-gray-600">{handle.message_count}</td>
      <td className="px-4 py-2 text-right text-gray-500 text-xs">
        {handle.last_seen ? format(imessageToDate(handle.last_seen), 'MMM d, yyyy') : '—'}
      </td>
    </tr>
  );
}

export default function ContactsPage() {
  return (
    <PageChrome>
      <Suspense fallback={<p className="p-6 text-gray-600">Loading…</p>}>
        <ContactsEditor />
      </Suspense>
    </PageChrome>
  );
}
