'use client';

import { useState, useEffect, useRef } from 'react';
import FileExplorer from './FileExplorer';
import { FileExplorerMode } from '@/lib/types/file-system';

interface PathConfigurationProps {
  onPathsSet: (dbPath: string, attachmentsPath: string, contactsPath: string) => void;
}

const DEFAULT_CONTACTS_PATH = '~/.imessage-pdf/contacts.json';

export default function PathConfiguration({ onPathsSet }: PathConfigurationProps) {
  const [dbPath, setDbPath] = useState('');
  const [attachmentsPath, setAttachmentsPath] = useState('');
  const [contactsPath, setContactsPath] = useState(DEFAULT_CONTACTS_PATH);
  const [isConfigured, setIsConfigured] = useState(false);
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false);
  const [fileExplorerMode, setFileExplorerMode] = useState<FileExplorerMode>('file');
  const [fileExplorerTarget, setFileExplorerTarget] = useState<'db' | 'attachments' | 'contacts'>('db');
  const dbFileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedDbPath = localStorage.getItem('imessage-db-path');
    const savedAttachmentsPath = localStorage.getItem('imessage-attachments-path');
    const savedContactsPath = localStorage.getItem('imessage-contacts-path');

    if (savedDbPath && savedAttachmentsPath) {
      setDbPath(savedDbPath);
      setAttachmentsPath(savedAttachmentsPath);
      const contacts = savedContactsPath || DEFAULT_CONTACTS_PATH;
      setContactsPath(contacts);
      setIsConfigured(true);
      onPathsSet(savedDbPath, savedAttachmentsPath, contacts);
    }
  }, [onPathsSet]);

  const handleSave = () => {
    if (dbPath && attachmentsPath) {
      localStorage.setItem('imessage-db-path', dbPath);
      localStorage.setItem('imessage-attachments-path', attachmentsPath);
      localStorage.setItem('imessage-contacts-path', contactsPath || DEFAULT_CONTACTS_PATH);
      setIsConfigured(true);
      onPathsSet(dbPath, attachmentsPath, contactsPath || DEFAULT_CONTACTS_PATH);
    }
  };

  const handleReset = () => {
    localStorage.removeItem('imessage-db-path');
    localStorage.removeItem('imessage-attachments-path');
    localStorage.removeItem('imessage-contacts-path');
    setDbPath('');
    setAttachmentsPath('');
    setContactsPath(DEFAULT_CONTACTS_PATH);
    setIsConfigured(false);
  };

  const handleDbFileSelect = () => {
    setFileExplorerMode('file');
    setFileExplorerTarget('db');
    setFileExplorerOpen(true);
  };

  const handleAttachmentsFileSelect = () => {
    setFileExplorerMode('directory');
    setFileExplorerTarget('attachments');
    setFileExplorerOpen(true);
  };

  const handleContactsFileSelect = () => {
    setFileExplorerMode('file');
    setFileExplorerTarget('contacts');
    setFileExplorerOpen(true);
  };

  const handleFileExplorerSelect = (path: string) => {
    if (fileExplorerTarget === 'db') {
      setDbPath(path);
    } else if (fileExplorerTarget === 'attachments') {
      setAttachmentsPath(path);
    } else {
      setContactsPath(path);
    }
    setFileExplorerOpen(false);
  };

  const handleFileExplorerClose = () => {
    setFileExplorerOpen(false);
  };

  const handleDbFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      alert('File selected: ' + file.name + '\n\nNote: Due to browser security restrictions, you may need to manually enter the full file path in the text field above.');
      if (file.name === 'chat.db') {
        setDbPath('~/Library/Messages/chat.db');
      }
    }
  };

  const handleAttachmentsFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      alert('File selected: ' + file.name + '\n\nNote: Due to browser security restrictions, you may need to manually enter the full directory path in the text field above.');
      setAttachmentsPath('~/Library/Messages/Attachments');
    }
  };

  if (isConfigured) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-green-800">Configuration Complete</h3>
            <p className="text-sm text-green-600 mt-1">
              Database: {dbPath}<br />
              Attachments: {attachmentsPath}<br />
              Contacts: {contactsPath}
            </p>
          </div>
          <button
            onClick={handleReset}
            className="text-sm text-green-600 hover:text-green-800 underline"
          >
            Change Paths
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
      <h2 className="text-lg font-semibold text-blue-900 mb-4">
        Configure iMessage Paths
      </h2>
      <p className="text-sm text-blue-700 mb-4">
        Enter the paths to your iMessage database and attachments folder. You can type the paths manually or use the Browse button to select files (note: file picker may not work in all browsers for security reasons).
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="dbPath" className="block text-sm font-medium text-gray-700 mb-1">
            Database Path (chat.db)
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              id="dbPath"
              value={dbPath}
              onChange={(e) => setDbPath(e.target.value)}
              placeholder="e.g., /Users/username/Library/Messages/chat.db"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={handleDbFileSelect}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Browse Files
            </button>
          </div>
          <input
            ref={dbFileInputRef}
            type="file"
            accept=".db"
            onChange={handleDbFileChange}
            style={{ display: 'none' }}
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={() => setDbPath('~/Library/Messages/chat.db')}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
            >
              macOS Default
            </button>
            <button
              type="button"
              onClick={() => setDbPath('/Users/' + (process.env.USER || 'username') + '/Library/Messages/chat.db')}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
            >
              Full Path
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Typically located at ~/Library/Messages/chat.db on macOS
          </p>
        </div>

        <div>
          <label htmlFor="attachmentsPath" className="block text-sm font-medium text-gray-700 mb-1">
            Attachments Path
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              id="attachmentsPath"
              value={attachmentsPath}
              onChange={(e) => setAttachmentsPath(e.target.value)}
              placeholder="e.g., /Users/username/Library/Messages/Attachments"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={handleAttachmentsFileSelect}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Browse Folders
            </button>
          </div>
          <input
            ref={attachmentsFileInputRef}
            type="file"
            onChange={handleAttachmentsFileChange}
            style={{ display: 'none' }}
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={() => setAttachmentsPath('~/Library/Messages/Attachments')}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
            >
              macOS Default
            </button>
            <button
              type="button"
              onClick={() => setAttachmentsPath('/Users/' + (process.env.USER || 'username') + '/Library/Messages/Attachments')}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
            >
              Full Path
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Typically located at ~/Library/Messages/Attachments on macOS
          </p>
        </div>

        <div>
          <label htmlFor="contactsPath" className="block text-sm font-medium text-gray-700 mb-1">
            Contacts File (JSON)
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              id="contactsPath"
              value={contactsPath}
              onChange={(e) => setContactsPath(e.target.value)}
              placeholder={DEFAULT_CONTACTS_PATH}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={handleContactsFileSelect}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Browse Files
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={() => setContactsPath(DEFAULT_CONTACTS_PATH)}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
            >
              Default
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Maps phone numbers and emails to names. Created automatically on first edit.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={!dbPath || !attachmentsPath}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Save Configuration
        </button>
      </div>

      <FileExplorer
        isOpen={fileExplorerOpen}
        onClose={handleFileExplorerClose}
        onSelect={handleFileExplorerSelect}
        mode={fileExplorerMode}
        initialPath="~"
      />
    </div>
  );
}
