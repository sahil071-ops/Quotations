'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FileText,
  GitMerge,
  MessageSquare,
  Package,
  Upload,
  ChevronLeft,
  BookOpen,
  Tag,
} from 'lucide-react';

const ADMIN_LINKS = [
  { href: '/admin/catalog', label: 'Catalog PDFs', icon: FileText },
  { href: '/admin/crossrefs', label: 'Competitor X-Refs', icon: GitMerge },
  { href: '/admin/feedback', label: 'Feedback', icon: MessageSquare },
  { href: '/admin/products', label: 'Products', icon: Package },
  { href: '/admin/import', label: 'Import', icon: Upload },
  { href: '/admin/training', label: 'Training Data', icon: BookOpen },
  { href: '/admin/categories', label: 'Categories', icon: Tag },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-52 flex-shrink-0 flex-col border-r border-gray-200 bg-gray-50 px-3 py-4">
      <Link
        href="/dashboard"
        className="mb-4 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
      >
        <ChevronLeft className="h-3 w-3" /> Back to dashboard
      </Link>

      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Admin
      </p>

      <nav className="space-y-0.5">
        {ADMIN_LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors ${
              pathname === href
                ? 'bg-blue-900 text-white'
                : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
