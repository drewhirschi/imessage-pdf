'use client';

import { useState } from 'react';
import Link from 'next/link';
import PathConfiguration from '@/components/PathConfiguration';
import ConversationList from '@/components/ConversationList';
import { ContactsProvider } from '@/components/ContactsProvider';
import PageChrome from '@/components/PageChrome';

export default function HomePage() {
  const [dbPath, setDbPath] = useState('');
  const [attachmentsPath, setAttachmentsPath] = useState('');
  const [contactsPath, setContactsPath] = useState('');

  const handlePathsSet = (db: string, attachments: string, contacts: string) => {
    setDbPath(db);
    setAttachmentsPath(attachments);
    setContactsPath(contacts);
  };

  const content = (
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
        <>
          <div className="flex justify-end gap-4">
            <Link
              href="/cover"
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Cover generator →
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
        </>
      )}

      {!dbPath && !attachmentsPath && (
        <>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <h3 className="text-lg font-medium text-yellow-800 mb-2">
              Get Started
            </h3>
            <p className="text-yellow-700">
              Configure your iMessage database and attachments paths above to begin exporting your conversations.
            </p>
          </div>
          <div className="text-center">
            <Link
              href="/cover"
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Or jump straight to the cover generator →
            </Link>
          </div>
        </>
      )}
    </div>
  );

  return (
    <ContactsProvider contactsPath={contactsPath}>
      <PageChrome>{content}</PageChrome>
    </ContactsProvider>
  );
}
