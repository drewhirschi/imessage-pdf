'use client';

import { useEffect, useRef, useState } from 'react';
import { useContacts } from './ContactsProvider';

interface InlineNameEditorProps {
  handleId: string;
  trigger?: React.ReactNode;
  size?: 'sm' | 'md';
}

export default function InlineNameEditor({
  handleId,
  trigger,
  size = 'sm',
}: InlineNameEditorProps) {
  const { entries, setName } = useContacts();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(entries[handleId]?.name ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(entries[handleId]?.name ?? '');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, entries, handleId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await setName(handleId, value);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title="Add or edit name"
        className={`${
          size === 'sm' ? 'text-xs' : 'text-sm'
        } text-gray-400 hover:text-blue-600`}
      >
        {trigger ?? '✎'}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="inline-flex items-center gap-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
          }
        }}
        placeholder="Name"
        className={`${
          size === 'sm' ? 'text-xs' : 'text-sm'
        } px-2 py-0.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white`}
      />
      <button
        type="submit"
        className={`${
          size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'
        } bg-blue-600 text-white rounded hover:bg-blue-700`}
      >
        Save
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        className={`${
          size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'
        } text-gray-500 hover:text-gray-700`}
      >
        Cancel
      </button>
    </form>
  );
}
