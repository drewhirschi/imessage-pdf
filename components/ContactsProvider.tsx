'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Contact, ContactsBook } from '@/lib/contacts/types';
import { resolveName } from '@/lib/contacts/resolve';

interface ContactsContextValue {
  entries: Record<string, Contact>;
  loaded: boolean;
  resolve: (handleId: string | null | undefined) => string | null;
  display: (handleId: string | null | undefined, fallback?: string) => string;
  setName: (handleId: string, name: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const ContactsContext = createContext<ContactsContextValue | null>(null);

export function ContactsProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, Contact>>({});
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts');
      if (!res.ok) throw new Error('Failed to load contacts');
      const book = (await res.json()) as ContactsBook;
      setEntries(book.contacts ?? {});
    } catch (err) {
      console.error(err);
      setEntries({});
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    setLoaded(false);
    refresh();
  }, [refresh]);

  const resolve = useCallback(
    (id: string | null | undefined) => resolveName(entries, id),
    [entries],
  );

  const display = useCallback(
    (id: string | null | undefined, fallback?: string) =>
      resolve(id) ?? (id ?? fallback ?? 'Unknown'),
    [resolve],
  );

  const setName = useCallback(
    async (handleId: string, name: string) => {
      const previous = entries;
      setEntries((current) => {
        const next = { ...current };
        const trimmed = name.trim();
        if (!trimmed) delete next[handleId];
        else next[handleId] = { ...next[handleId], name: trimmed };
        return next;
      });
      try {
        const res = await fetch('/api/contacts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handleId, name }),
        });
        if (!res.ok) throw new Error('Failed to save contact');
      } catch (err) {
        console.error('Failed to save contact, rolling back', err);
        setEntries(previous);
      }
    },
    [entries],
  );

  const value = useMemo<ContactsContextValue>(
    () => ({ entries, loaded, resolve, display, setName, refresh }),
    [entries, loaded, resolve, display, setName, refresh],
  );

  return (
    <ContactsContext.Provider value={value}>{children}</ContactsContext.Provider>
  );
}

export function useContacts(): ContactsContextValue {
  const ctx = useContext(ContactsContext);
  if (!ctx) {
    throw new Error('useContacts must be used within a ContactsProvider');
  }
  return ctx;
}

export function useContactsOptional(): ContactsContextValue | null {
  return useContext(ContactsContext);
}
