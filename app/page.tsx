'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Database, FolderOpen } from 'lucide-react';
import PathConfiguration from '@/components/PathConfiguration';
import ConversationList from '@/components/ConversationList';
import FullDiskAccessScreen from '@/components/FullDiskAccessScreen';
import { ContactsProvider } from '@/components/ContactsProvider';
import PageChrome from '@/components/PageChrome';

const DB_KEY = 'imessage-db-path';
const ATT_KEY = 'imessage-attachments-path';

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
  const [autoDetected, setAutoDetected] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const goReady = useCallback(
    (db: string, att: string, detected: boolean) => {
      setDbPath(db);
      setAttachmentsPath(att);
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

      if (h.overall === 'ok') {
        // Found + readable: save silently, straight to conversations.
        localStorage.setItem(DB_KEY, h.resolved.dbPath);
        localStorage.setItem(ATT_KEY, h.resolved.attachmentsPath);
        goReady(h.resolved.dbPath, h.resolved.attachmentsPath, true);
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
    if (savedDb && savedAtt) {
      goReady(savedDb, savedAtt, false);
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

  const handlePathsSet = (db: string, att: string) => {
    goReady(db, att, false);
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
      <div className="mx-auto max-w-2xl pt-5">
        <div className="mb-7">
          <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-[#cbdcf1] bg-[#eef5fd] text-[#1473e6]">
            <FolderOpen className="size-5" />
          </div>
          <h1 className="text-2xl font-semibold text-[#202124]">
            Locate your Messages data
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#656a70]">
            Choose your Messages folder or a copied backup. Your archive stays
            on this Mac and is opened read-only.
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
      <div>
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-[#1b8f55]">
              <Database className="size-3.5" />
              Database connected{autoDetected ? ' automatically' : ''}
            </div>
            <h1 className="text-[22px] font-semibold text-[#202124]">
              Conversations
            </h1>
            <p className="mt-1 text-sm text-[#6b7075]">
              Find a thread, review its messages, then export the range you need.
            </p>
          </div>
        </div>

        {health?.db.status === 'ok' &&
          health.attachments.status === 'not_found' && (
            <div className="mb-5 flex gap-3 rounded-md border border-[#e9c46a] bg-[#fff9e8] px-4 py-3 text-sm text-[#775b14]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                The attachment folder is unavailable. Messages will load, but
                images and files may be missing.
              </span>
            </div>
          )}

        <ConversationList
          dbPath={dbPath}
          attachmentsPath={attachmentsPath}
        />
      </div>
    );
  }

  return (
    <ContactsProvider>
      <PageChrome
        databasePath={phase === 'ready' ? dbPath : undefined}
        onChangeDatabase={phase === 'ready' ? handleChange : undefined}
      >
        {content}
      </PageChrome>
    </ContactsProvider>
  );
}
