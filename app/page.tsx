'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import PathConfiguration from '@/components/PathConfiguration';
import ConversationList from '@/components/ConversationList';
import FullDiskAccessScreen from '@/components/FullDiskAccessScreen';
import { ContactsProvider } from '@/components/ContactsProvider';
import PageChrome from '@/components/PageChrome';

const DEFAULT_CONTACTS_PATH = '~/.imessage-pdf/contacts.json';

const DB_KEY = 'imessage-db-path';
const ATT_KEY = 'imessage-attachments-path';
const CONTACTS_KEY = 'imessage-contacts-path';

type Phase = 'loading' | 'ready' | 'permission' | 'manual';

interface PathHealth {
  status: 'ok' | 'not_found' | 'permission_denied';
  path: string;
  detail: string;
}

interface HealthResponse {
  db: PathHealth;
  attachments: PathHealth;
  overall: 'ok' | 'not_found' | 'permission_denied';
  resolved: { dbPath: string; attachmentsPath: string; source: string };
  probedDefault: boolean;
}

export default function HomePage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [dbPath, setDbPath] = useState('');
  const [attachmentsPath, setAttachmentsPath] = useState('');
  const [contactsPath, setContactsPath] = useState('');
  const [autoDetected, setAutoDetected] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const goReady = useCallback(
    (db: string, att: string, contacts: string, detected: boolean) => {
      setDbPath(db);
      setAttachmentsPath(att);
      setContactsPath(contacts);
      setAutoDetected(detected);
      setPhase('ready');
    },
    [],
  );

  // Probe the default macOS location and route to the right screen.
  const runAutoDetect = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('health check failed');
      const h = (await res.json()) as HealthResponse;
      setHealth(h);

      const contacts =
        localStorage.getItem(CONTACTS_KEY) || DEFAULT_CONTACTS_PATH;

      if (h.overall === 'ok') {
        // Found + readable: save silently, straight to conversations.
        localStorage.setItem(DB_KEY, h.resolved.dbPath);
        localStorage.setItem(ATT_KEY, h.resolved.attachmentsPath);
        localStorage.setItem(CONTACTS_KEY, contacts);
        goReady(h.resolved.dbPath, h.resolved.attachmentsPath, contacts, true);
      } else if (h.db.status === 'permission_denied') {
        setPhase('permission');
      } else {
        setPhase('manual');
      }
    } catch {
      // Network / unexpected failure — fall back to the manual picker.
      setPhase('manual');
    }
  }, [goReady]);

  // First load: prefer saved paths, else auto-detect.
  useEffect(() => {
    const savedDb = localStorage.getItem(DB_KEY);
    const savedAtt = localStorage.getItem(ATT_KEY);
    const savedContacts =
      localStorage.getItem(CONTACTS_KEY) || DEFAULT_CONTACTS_PATH;
    if (savedDb && savedAtt) {
      goReady(savedDb, savedAtt, savedContacts, false);
      // Background re-probe: saved paths can go stale (FDA revoked, db
      // moved). Route to the right screen instead of a raw fetch error.
      fetch(
        `/api/health?dbPath=${encodeURIComponent(savedDb)}&attachmentsPath=${encodeURIComponent(savedAtt)}`,
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((h: HealthResponse | null) => {
          if (!h) return;
          setHealth(h);
          if (h.db.status === 'permission_denied') setPhase('permission');
          else if (h.db.status === 'not_found') setPhase('manual');
        })
        .catch(() => {});
      return;
    }
    runAutoDetect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePathsSet = (db: string, att: string, contacts: string) => {
    goReady(db, att, contacts, false);
  };

  const handleChange = () => {
    // Drop saved paths so PathConfiguration shows the editable form again.
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(ATT_KEY);
    setPhase('manual');
  };

  let content: React.ReactNode;

  if (phase === 'loading') {
    content = (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3" />
        Looking for your Messages database…
      </div>
    );
  } else if (phase === 'permission') {
    content = (
      <FullDiskAccessScreen
        dbPath={health?.db.path}
        detail={health?.db.detail}
        onRetry={runAutoDetect}
        onManual={() => setPhase('manual')}
      />
    );
  } else if (phase === 'manual') {
    const hint = health ? (
      <>
        We looked for a Messages database at{' '}
        <code className="text-xs bg-white/60 px-1 py-0.5 rounded break-all">
          {health.db.path}
        </code>{' '}
        but didn&apos;t find a readable one. Enter the path to your{' '}
        <strong>chat.db</strong> (or a backup folder that contains it) below.
      </>
    ) : undefined;
    content = (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            iMessage PDF Exporter
          </h1>
          <p className="text-lg text-gray-600">
            Export your iMessage conversations to beautiful, printable PDFs
          </p>
        </div>
        <PathConfiguration
          onPathsSet={handlePathsSet}
          initialDbPath={health?.resolved.dbPath || ''}
          initialAttachmentsPath={health?.resolved.attachmentsPath || ''}
          hint={hint}
        />
      </div>
    );
  } else {
    // ready
    content = (
      <div className="space-y-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-green-800 min-w-0">
            Using database at{' '}
            <code className="text-xs bg-white/70 px-1 py-0.5 rounded break-all">
              {dbPath}
            </code>
            {autoDetected && (
              <span className="text-green-600"> (auto-detected)</span>
            )}
          </p>
          <button
            onClick={handleChange}
            className="text-sm text-green-700 hover:text-green-900 underline whitespace-nowrap"
          >
            Change
          </button>
        </div>

        {health?.db.status === 'ok' &&
          health.attachments.status === 'not_found' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
              Attachments folder not found at{' '}
              <code className="text-xs bg-white/70 px-1 py-0.5 rounded break-all">
                {health.attachments.path}
              </code>{' '}
              — messages will load, but images and files won&apos;t.
            </div>
          )}

        <div className="flex justify-end gap-4">
          <Link
            href={`/diagnostics?dbPath=${encodeURIComponent(dbPath)}&attachmentsPath=${encodeURIComponent(attachmentsPath)}`}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Database health →
          </Link>
          <Link
            href={`/contacts?dbPath=${encodeURIComponent(dbPath)}&contactsPath=${encodeURIComponent(contactsPath)}`}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Edit contacts book →
          </Link>
        </div>

        <ConversationList
          dbPath={dbPath}
          attachmentsPath={attachmentsPath}
          contactsPath={contactsPath}
        />
      </div>
    );
  }

  return (
    <ContactsProvider contactsPath={contactsPath}>
      <PageChrome>{content}</PageChrome>
    </ContactsProvider>
  );
}
