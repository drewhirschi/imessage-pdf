'use client';

import { useEffect, useState } from 'react';

const FDA_DEEP_LINK =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';

interface ElectronBridge {
  openExternal?: (url: string) => void;
  relaunch?: () => void;
}

function getElectronBridge(): ElectronBridge | null {
  if (typeof window === 'undefined') return null;
  // The packaged Electron app is expected to expose a preload bridge. In pure
  // browser dev mode this is absent and the Electron-only controls hide.
  const w = window as unknown as { electron?: ElectronBridge };
  return w.electron ?? null;
}

interface FullDiskAccessScreenProps {
  /** Path we tried to open, for display. */
  dbPath?: string;
  detail?: string;
  /** Re-run the health check (e.g. after granting access). */
  onRetry: () => void;
  /** Fall back to typing paths manually. */
  onManual: () => void;
}

export default function FullDiskAccessScreen({
  dbPath,
  detail,
  onRetry,
  onManual,
}: FullDiskAccessScreenProps) {
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    setIsElectron(!!getElectronBridge());
  }, []);

  // Re-check automatically when the window regains focus — the moment the user
  // comes back from System Settings after granting access, this clears itself.
  useEffect(() => {
    const onFocus = () => onRetry();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [onRetry]);

  const openSettings = () => {
    const bridge = getElectronBridge();
    if (bridge?.openExternal) {
      bridge.openExternal(FDA_DEEP_LINK);
      return;
    }
    // Browser mode: attempt the deep link; on non-macOS it simply no-ops, so
    // the written instructions below are the real guidance.
    try {
      window.location.href = FDA_DEEP_LINK;
    } catch {
      /* ignore — instructions below cover it */
    }
  };

  const grantee = isElectron
    ? 'iMessage PDF Exporter'
    : 'your terminal app (the one running the dev server, e.g. Terminal or iTerm)';

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl" aria-hidden>
            🔒
          </span>
          <h1 className="text-2xl font-bold text-gray-900">
            Full Disk Access needed
          </h1>
        </div>

        <p className="text-gray-700 mb-4">
          macOS keeps your Messages database private. To read it, grant{' '}
          <strong>Full Disk Access</strong> to <strong>{grantee}</strong>.
          Everything stays on this machine — the database is opened{' '}
          <strong>read-only</strong> and nothing is uploaded.
        </p>

        {dbPath && (
          <p className="text-sm text-gray-500 mb-4">
            We tried to open{' '}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded break-all">
              {dbPath}
            </code>
            {detail ? ` — ${detail}` : null}
          </p>
        )}

        <ol className="list-decimal list-inside space-y-2 text-gray-700 mb-6 bg-gray-50 rounded-lg p-4">
          <li>
            Open{' '}
            <strong>
              System Settings → Privacy &amp; Security → Full Disk Access
            </strong>
            .
          </li>
          <li>
            Turn on the switch for <strong>{grantee}</strong> (use{' '}
            <strong>+</strong> to add it if it is not listed).
          </li>
          <li>
            macOS requires the app to be <strong>restarted</strong> after
            granting. {isElectron ? 'Use “Quit & Reopen” below.' : 'Restart the terminal and dev server, then retry.'}
          </li>
        </ol>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={openSettings}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            Open System Settings
          </button>
          {isElectron && (
            <button
              onClick={() => getElectronBridge()?.relaunch?.()}
              className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 text-sm font-medium"
            >
              Quit &amp; Reopen
            </button>
          )}
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium"
          >
            Retry
          </button>
          <button
            onClick={onManual}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm underline"
          >
            Enter paths manually
          </button>
        </div>

        {!isElectron && (
          <p className="text-xs text-gray-400 mt-4">
            The “Open System Settings” deep link only works on macOS. On other
            platforms, or when running a copied backup, use “Enter paths
            manually”.
          </p>
        )}
      </div>
    </div>
  );
}
