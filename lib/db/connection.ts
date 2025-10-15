import Database from "better-sqlite3";

let db: Database.Database | null = null;

export function connectToDatabase(dbPath: string): Database.Database {
  if (db) {
    return db;
  }

  try {
    db = new Database(dbPath, { readonly: true });
    return db;
  } catch (error) {
    console.error("Failed to connect to database:", error);
    throw new Error(`Failed to connect to database at ${dbPath}`);
  }
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database not connected. Call connectToDatabase first.");
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function isConnected(): boolean {
  return db !== null;
}
