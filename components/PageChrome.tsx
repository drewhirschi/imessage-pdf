'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  ContactRound,
  Database,
  MessageSquareText,
  Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageChromeProps {
  children: ReactNode;
  databasePath?: string;
  onChangeDatabase?: () => void;
  fullWidth?: boolean;
}

export default function PageChrome({
  children,
  databasePath,
  onChangeDatabase,
  fullWidth = false,
}: PageChromeProps) {
  const pathname = usePathname();

  const nav = [
    {
      href: '/',
      label: 'Conversations',
      icon: MessageSquareText,
      active: pathname === '/' || pathname.startsWith('/conversation/'),
    },
    {
      href: '/contacts',
      label: 'Contacts',
      icon: ContactRound,
      active: pathname === '/contacts',
    },
    {
      href: '/diagnostics',
      label: 'Stats',
      icon: Activity,
      active: pathname === '/diagnostics',
    },
  ];

  return (
    <div className="min-h-screen bg-[#f6f7f8]">
      <header className="sticky top-0 z-40 border-b border-[#dfe2e5] bg-white/95 backdrop-blur">
        <div className="flex h-14 w-full items-center gap-5 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-[7px] bg-[#1473e6] text-white shadow-sm">
              <MessageSquareText className="size-[18px]" strokeWidth={2.2} />
            </span>
            <span className="hidden text-sm font-semibold text-[#202124] sm:block">
              Message Archive
            </span>
          </Link>

          <nav className="flex h-full min-w-0 flex-1 items-center gap-1" aria-label="Main navigation">
            {nav.map(({ href, label, icon: Icon, active }) => (
              <Link
                key={label}
                href={href}
                className={cn(
                  'relative flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
                  active
                    ? 'bg-[#eef4fc] text-[#0b63ce]'
                    : 'text-[#5f6368] hover:bg-[#f3f4f5] hover:text-[#202124]',
                )}
              >
                <Icon className="size-4" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {databasePath && (
              <div className="hidden max-w-[250px] items-center gap-2 rounded-md border border-[#dfe2e5] bg-[#fafbfc] px-2.5 py-1.5 text-xs text-[#5f6368] lg:flex">
                <Database className="size-3.5 text-[#1b8f55]" />
                <span className="truncate">Messages database</span>
                <span className="size-1.5 rounded-full bg-[#21a366]" />
              </div>
            )}
            {onChangeDatabase && (
              <button
                type="button"
                onClick={onChangeDatabase}
                title="Change data folder"
                aria-label="Change data folder"
                className="flex size-9 items-center justify-center rounded-md text-[#5f6368] transition-colors hover:bg-[#f0f1f2] hover:text-[#202124]"
              >
                <Settings2 className="size-[18px]" />
              </button>
            )}
          </div>
        </div>
      </header>
      <main
        className={cn(
          'w-full',
          fullWidth ? '' : 'px-4 py-6 sm:px-6 sm:py-8',
        )}
      >
        {children}
      </main>
    </div>
  );
}
