'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import FileExplorer from './FileExplorer';
import { FileExplorerMode } from '@/lib/types/file-system';

interface PathConfigurationProps {
  onPathsSet: (dbPath: string, attachmentsPath: string) => void;
  /** Prefill the db path input (e.g. with the auto-detected default). */
  initialDbPath?: string;
  /** Prefill the attachments path input. */
  initialAttachmentsPath?: string;
  /** Optional hint rendered above the form (what we looked for and didn't find). */
  hint?: ReactNode;
}

export default function PathConfiguration({
  onPathsSet,
  initialDbPath = '',
  initialAttachmentsPath = '',
  hint,
}: PathConfigurationProps) {
  const [dbPath, setDbPath] = useState(initialDbPath);
  const [attachmentsPath, setAttachmentsPath] = useState(initialAttachmentsPath);
  const [isConfigured, setIsConfigured] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false);
  const [fileExplorerMode, setFileExplorerMode] = useState<FileExplorerMode>('file');
  const [fileExplorerTarget, setFileExplorerTarget] = useState<'db' | 'attachments'>('db');
  const dbFileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedDbPath = localStorage.getItem('imessage-db-path');
    const savedAttachmentsPath = localStorage.getItem('imessage-attachments-path');
    if (savedDbPath && savedAttachmentsPath) {
      setDbPath(savedDbPath);
      setAttachmentsPath(savedAttachmentsPath);
      setIsConfigured(true);
      onPathsSet(savedDbPath, savedAttachmentsPath);
    }
  }, [onPathsSet]);

  const handleSave = async () => {
    if (!dbPath || !attachmentsPath) return;
    // Resolve through the health endpoint so a backup folder containing
    // chat.db + Attachments/ saves as the actual file paths, and typos
    // surface here instead of as broken API calls later.
    let resolvedDb = dbPath;
    let resolvedAtt = attachmentsPath;
    try {
      const res = await fetch(
        `/api/health?dbPath=${encodeURIComponent(dbPath)}&attachmentsPath=${encodeURIComponent(attachmentsPath)}`,
      );
      if (res.ok) {
        const h = await res.json();
        if (h.db?.status !== 'ok') {
          setSaveError(
            h.db?.detail ||
              'Could not open a Messages database at that path. Check the path and try again.',
          );
          return;
        }
        resolvedDb = h.resolved?.dbPath || dbPath;
        resolvedAtt = h.resolved?.attachmentsPath || attachmentsPath;
      }
    } catch {
      // Health endpoint unreachable — fall through and save what was typed.
    }
    setSaveError(null);
    localStorage.setItem('imessage-db-path', resolvedDb);
    localStorage.setItem('imessage-attachments-path', resolvedAtt);
    setDbPath(resolvedDb);
    setAttachmentsPath(resolvedAtt);
    setIsConfigured(true);
    onPathsSet(resolvedDb, resolvedAtt);
  };

  const handleReset = () => {
    localStorage.removeItem('imessage-db-path');
    localStorage.removeItem('imessage-attachments-path');
    setDbPath('');
    setAttachmentsPath('');
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

  const handleFileExplorerSelect = (path: string) => {
    if (fileExplorerTarget === 'db') {
      setDbPath(path);
    } else if (fileExplorerTarget === 'attachments') {
      setAttachmentsPath(path);
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
              Attachments: {attachmentsPath}
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

      {hint && (
        <div className="text-sm text-blue-800 bg-blue-100 border border-blue-200 rounded-md p-3 mb-4">
          {hint}
        </div>
      )}

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

        {saveError && (
          <p className="text-sm text-red-600" role="alert">
            {saveError}
          </p>
        )}

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
