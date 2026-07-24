'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { DatabaseHealth } from '@/lib/db/types';

function pct(n: number, total: number): string {
  if (!total) return '0%';
  return `${((n / total) * 100).toFixed(1)}%`;
}

function num(n: number): string {
  return n.toLocaleString();
}

// Empirically derived from a real backup (see docs/plans/missing-text-and-sync-stats.md).
const TRANSFER_STATE_LABELS: Record<number, string> = {
  5: 'Downloaded (present on disk)',
  0: 'Not downloaded (absent on disk)',
  [-1]: 'Failed / unknown',
};

interface Props {
  initialDbPath?: string;
  initialAttachmentsPath?: string;
}

export default function DiagnosticsPanel({
  initialDbPath,
  initialAttachmentsPath,
}: Props) {
  const [dbPath, setDbPath] = useState(initialDbPath ?? '');
  const [attachmentsPath, setAttachmentsPath] = useState(
    initialAttachmentsPath ?? ''
  );
  const [data, setData] = useState<DatabaseHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fall back to the paths PathConfiguration persisted.
  useEffect(() => {
    if (!dbPath) {
      setDbPath(localStorage.getItem('imessage-db-path') ?? '');
    }
    if (!attachmentsPath) {
      setAttachmentsPath(localStorage.getItem('imessage-attachments-path') ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dbPath) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ dbPath });
    if (attachmentsPath) params.set('attachmentsPath', attachmentsPath);
    fetch(`/api/diagnostics?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? 'Request failed');
        return res.json();
      })
      .then((json: DatabaseHealth) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dbPath, attachmentsPath]);

  const maxYear = useMemo(
    () => (data ? Math.max(1, ...data.messagesByYear.map((y) => y.count)) : 1),
    [data]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Database health</h1>
          <p className="text-sm text-gray-600">
            Diagnostics for the currently configured chat.db
          </p>
        </div>
        <Link href="/" className="text-sm text-blue-600 hover:text-blue-800 underline">
          ← Back to conversations
        </Link>
      </div>

      {!dbPath && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 text-yellow-800">
          No database path configured. Set it on the home page first.
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
          {error}
        </div>
      )}
      {loading && <div className="text-gray-500">Analyzing database…</div>}

      {data && (
        <>
          {/* Text recoverability */}
          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Message text
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Total messages" value={num(data.totalMessages)} />
              <Stat label="Displayable" value={num(data.displayableMessages)} />
              <Stat
                label="Has plain text"
                value={num(data.withText)}
                sub={pct(data.withText, data.displayableMessages)}
              />
              <Stat
                label="Recovered from attributedBody"
                value={num(data.recoverableText)}
                sub={pct(data.recoverableText, data.displayableMessages)}
                highlight
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat
                label="Truly empty"
                value={num(data.trueEmpty)}
                sub={pct(data.trueEmpty, data.displayableMessages)}
              />
            </div>
            <p className="mt-4 text-xs text-gray-500">
              &quot;Recovered from attributedBody&quot; messages have an empty{' '}
              <code>text</code> column but a populated typedstream body; the
              viewer, print view, and PDF now decode these server-side.
            </p>
          </section>

          {/* Per-year histogram */}
          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Messages per year
            </h2>
            {data.messagesByYear.length === 0 ? (
              <p className="text-sm text-gray-500">No dated messages.</p>
            ) : (
              <div className="space-y-1">
                {data.messagesByYear.map((y) => (
                  <div key={y.year} className="flex items-center gap-3">
                    <span className="w-12 text-right text-sm tabular-nums text-gray-600">
                      {y.year}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-gray-100">
                      <div
                        className="h-full rounded bg-blue-500"
                        style={{ width: `${(y.count / maxYear) * 100}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-sm tabular-nums text-gray-700">
                      {num(y.count)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Attachments */}
          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Attachments
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Total" value={num(data.attachments.total)} />
              <Stat
                label="With filename"
                value={num(data.attachments.withFilename)}
              />
              {data.attachments.onDisk && (
                <>
                  <Stat
                    label="Present on disk (est.)"
                    value={num(data.attachments.onDisk.estimatedPresent)}
                    sub={`${pct(
                      data.attachments.onDisk.present,
                      data.attachments.onDisk.sampled
                    )} of ${num(data.attachments.onDisk.sampled)} sampled`}
                    highlight
                  />
                  <Stat
                    label="Missing on disk (est.)"
                    value={num(data.attachments.onDisk.estimatedMissing)}
                  />
                </>
              )}
            </div>
            {!data.attachments.onDisk && (
              <p className="mt-3 text-xs text-gray-500">
                Configure an attachments path on the home page to sample on-disk
                presence.
              </p>
            )}

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-medium text-gray-700">
                  transfer_state
                </h3>
                <table className="w-full text-sm">
                  <tbody>
                    {data.attachments.byTransferState.map((r) => (
                      <tr key={r.state} className="border-t border-gray-100">
                        <td className="py-1 pr-2 tabular-nums text-gray-500">
                          {r.state}
                        </td>
                        <td className="py-1 pr-2 text-gray-700">
                          {TRANSFER_STATE_LABELS[r.state] ?? '—'}
                        </td>
                        <td className="py-1 text-right tabular-nums text-gray-900">
                          {num(r.count)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-gray-700">
                  ck_sync_state
                </h3>
                <table className="w-full text-sm">
                  <tbody>
                    {data.attachments.byCkSyncState.map((r) => (
                      <tr key={r.state} className="border-t border-gray-100">
                        <td className="py-1 pr-2 tabular-nums text-gray-500">
                          {r.state}
                        </td>
                        <td className="py-1 text-right tabular-nums text-gray-900">
                          {num(r.count)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-gray-400">
                  CloudKit sync bookkeeping; not a reliable presence signal.
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
        {value}
      </div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );
}
