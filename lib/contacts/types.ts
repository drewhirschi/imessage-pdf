export interface Contact {
  name: string;
  note?: string;
}

export interface ContactsBook {
  version: 1;
  contacts: Record<string, Contact>;
}

export const EMPTY_BOOK: ContactsBook = { version: 1, contacts: {} };
