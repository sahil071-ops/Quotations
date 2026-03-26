'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Search, LayoutDashboard, Settings } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';

interface NavbarProps {
  role?: 'engineer' | 'admin';
  fullName?: string | null;
}

export default function Navbar({ role, fullName }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/query', label: 'Query', icon: Search },
    ...(role === 'admin'
      ? [{ href: '/admin/catalog', label: 'Admin', icon: Settings }]
      : []),
  ];

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-900 text-xs font-bold text-white">
            AX
          </div>
          <span className="font-semibold text-gray-900">AIQE</span>
          <span className="hidden text-xs text-gray-400 sm:block">Axis Intelligence Quoting Engine</span>
        </div>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname.startsWith(href)
                  ? 'bg-blue-50 text-blue-900'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>

        {/* User / signout */}
        <div className="flex items-center gap-3">
          {fullName && (
            <span className="hidden text-sm text-gray-600 sm:block">{fullName}</span>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
