'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { CircleHelp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const FDA_DEEP_LINK =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';

interface ElectronBridge {
  openExternal?: (url: string) => void;
  showAppInFinder?: () => void;
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
  onRetry: () => void | Promise<void>;
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
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

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

  const retry = async () => {
    setRetrying(true);
    setRetryMessage(null);
    await onRetry();
    setRetrying(false);
    setRetryMessage(
      'Access is still denied. Confirm the app is enabled in Full Disk Access, then quit and reopen it.',
    );
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

        {isElectron && (
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
              >
                <CircleHelp className="size-4" />
                How do I do this?
              </button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
              <DialogHeader className="border-b border-gray-200 px-6 py-5 pr-12">
                <DialogTitle>Grant Full Disk Access</DialogTitle>
                <DialogDescription>
                  macOS requires you to add the app manually the first time.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-8 px-6 pb-6 pt-6">
                <figure className="space-y-3">
                  <figcaption className="flex items-start gap-3 text-sm text-gray-700">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-600 font-semibold text-white">
                      1
                    </span>
                    <span>
                      In <strong>Full Disk Access</strong>, click the{' '}
                      <strong>+</strong> below the app list.
                    </span>
                  </figcaption>
                  <Image
                    src="/onboarding/full-disk-access-add.png"
                    alt="Full Disk Access settings with the plus button at the bottom of the application list"
                    width={1400}
                    height={1235}
                    className="h-auto w-full rounded-md border border-gray-200"
                  />
                </figure>

                <figure className="space-y-3">
                  <figcaption className="flex items-start gap-3 text-sm text-gray-700">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-600 font-semibold text-white">
                      2
                    </span>
                    <span>
                      Open <strong>Applications</strong>, select{' '}
                      <strong>iMessage PDF Exporter</strong>, and click{' '}
                      <strong>Open</strong>. Then enable its switch.
                    </span>
                  </figcaption>
                  <Image
                    src="/onboarding/full-disk-access-select-app.png"
                    alt="Applications folder with iMessage PDF Exporter selected and ready to open"
                    width={1400}
                    height={790}
                    className="h-auto w-full rounded-md border border-gray-200"
                  />
                </figure>

                <figure className="space-y-3">
                  <figcaption className="flex items-start gap-3 text-sm text-gray-700">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-600 font-semibold text-white">
                      3
                    </span>
                    <span>
                      When macOS asks, choose <strong>Quit &amp; Reopen</strong>.
                      The app will restart with access to your Messages library.
                    </span>
                  </figcaption>
                  <Image
                    src="/onboarding/full-disk-access-reopen.png"
                    alt="macOS confirmation asking to quit and reopen iMessage PDF Exporter"
                    width={1400}
                    height={1235}
                    className="h-auto w-full rounded-md border border-gray-200"
                  />
                </figure>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {dbPath && (
          <p className="text-sm text-gray-500 mb-4">
            We tried to open{' '}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded break-all">
              {dbPath}
            </code>
            {detail ? ` — ${detail}` : null}
          </p>
        )}

        <ol className="list-decimal space-y-2 pl-9 text-gray-700 mb-6 bg-gray-50 rounded-lg p-4">
          <li>
            Open{' '}
            <strong>
              System Settings → Privacy &amp; Security → Full Disk Access
            </strong>
            .
          </li>
          <li>
            Click the <strong>+</strong> button below the app list. The app is
            usually not listed the first time.
          </li>
          {isElectron && (
            <li>
              In the file picker, open <strong>Applications</strong>, select{' '}
              <strong>iMessage PDF Exporter</strong>, then click{' '}
              <strong>Open</strong>.
            </li>
          )}
          <li>
            Make sure the switch next to <strong>{grantee}</strong> is on.
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
              onClick={() => getElectronBridge()?.showAppInFinder?.()}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium"
            >
              Show App in Finder
            </button>
          )}
          {isElectron && (
            <button
              onClick={() => getElectronBridge()?.relaunch?.()}
              className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 text-sm font-medium"
            >
              Quit &amp; Reopen
            </button>
          )}
          <button
            onClick={retry}
            disabled={retrying}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium"
          >
            {retrying ? 'Checking…' : 'Retry'}
          </button>
          <button
            onClick={onManual}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm underline"
          >
            Enter paths manually
          </button>
        </div>

        {retryMessage && (
          <p role="status" className="mt-3 text-sm text-amber-700">
            {retryMessage}
          </p>
        )}

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
