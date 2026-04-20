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
  contactsPath: string;
  entries: Record<string, Contact>;
  loaded: boolean;
  resolve: (handleId: string | null | undefined) => string | null;
  display: (handleId: string | null | undefined, fallback?: string) => string;
  setName: (handleId: string, name: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const ContactsContext = createContext<ContactsContextValue | null>(null);

interface ContactsProviderProps {
  contactsPath: string;
  children: ReactNode;
}

export function ContactsProvider({ contactsPath, children }: ContactsProviderProps) {
  const [entries, setEntries] = useState<Record<string, Contact>>({});
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!contactsPath) {
      setEntries({});
      setLoaded(true);
      return;
    }
    try {
      const res = await fetch(
        `/api/contacts?path=${encodeURIComponent(contactsPath)}`,
      );
      if (!res.ok) throw new Error('Failed to load contacts');
      const book = (await res.json()) as ContactsBook;
      setEntries(book.contacts ?? {});
    } catch (err) {
      console.error(err);
      setEntries({});
    } finally {
      setLoaded(true);
    }
  }, [contactsPath]);

  useEffect(() => {
    setLoaded(false);
    refresh();
  }, [refresh]);

  const resolve = useCallback(
    (id: string | null | undefined) => resolveName(entries, id),
    [entries],
  );

  const display = useCallback(
    (id: string | null | undefined, fallback?: string) => {
      return resolve(id) ?? (id ?? fallback ?? 'Unknown');
    },
    [resolve],
  );

  const setName = useCallback(
    async (handleId: string, name: string) => {
      setEntries((prev) => {
        const next = { ...prev };
        const trimmed = name.trim();
        if (!trimmed) delete next[handleId];
        else next[handleId] = { ...next[handleId], name: trimmed };
        return next;
      });
      if (!contactsPath) return;
      try {
        await fetch(
          `/api/contacts?path=${encodeURIComponent(contactsPath)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handleId, name }),
          },
        );
      } catch (err) {
        console.error('Failed to save contact, rolling back', err);
        await refresh();
      }
    },
    [contactsPath, refresh],
  );

  const value = useMemo<ContactsContextValue>(
    () => ({ contactsPath, entries, loaded, resolve, display, setName, refresh }),
    [contactsPath, entries, loaded, resolve, display, setName, refresh],
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
