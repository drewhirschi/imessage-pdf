'use client';

import { useState } from 'react';
import PathConfiguration from '@/components/PathConfiguration';
import ConversationList from '@/components/ConversationList';

export default function HomePage() {
  const [dbPath, setDbPath] = useState('');
  const [attachmentsPath, setAttachmentsPath] = useState('');

  const handlePathsSet = (db: string, attachments: string) => {
    setDbPath(db);
    setAttachmentsPath(attachments);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          iMessage PDF Exporter
        </h1>
        <p className="text-lg text-gray-600">
          Export your iMessage conversations to beautiful, printable PDFs
        </p>
      </div>

      <PathConfiguration onPathsSet={handlePathsSet} />

      {dbPath && attachmentsPath && (
        <ConversationList dbPath={dbPath} attachmentsPath={attachmentsPath} />
      )}

      {!dbPath && !attachmentsPath && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <h3 className="text-lg font-medium text-yellow-800 mb-2">
            Get Started
          </h3>
          <p className="text-yellow-700">
            Configure your iMessage database and attachments paths above to begin exporting your conversations.
          </p>
        </div>
      )}
    </div>
  );
}