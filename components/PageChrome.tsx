import type { ReactNode } from 'react';

interface PageChromeProps {
  children: ReactNode;
}

export default function PageChrome({ children }: PageChromeProps) {
  return (
    <div className="min-h-screen">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">
              iMessage PDF Exporter
            </h1>
            <p className="text-sm text-gray-500">
              Export your conversations to printable PDFs
            </p>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
