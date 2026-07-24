'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PageChrome from '@/components/PageChrome';
import DiagnosticsPanel from '@/components/DiagnosticsPanel';

function DiagnosticsPageInner() {
  const params = useSearchParams();
  return (
    <DiagnosticsPanel
      initialDbPath={params.get('dbPath') ?? undefined}
      initialAttachmentsPath={params.get('attachmentsPath') ?? undefined}
    />
  );
}

export default function DiagnosticsPage() {
  return (
    <PageChrome>
      <Suspense fallback={<div className="text-gray-500">Loading…</div>}>
        <DiagnosticsPageInner />
      </Suspense>
    </PageChrome>
  );
}
