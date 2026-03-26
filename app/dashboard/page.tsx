import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { Search, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { COUNTRY_MAP } from '@/constants/countries';
import type { Query } from '@/types';

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const adminSupabase = createAdminSupabaseClient();
  const { data: profile } = await adminSupabase
    .from('users_profile')
    .select('full_name, role')
    .eq('id', user!.id)
    .single();

  // Recent queries
  const { data: recentQueries } = await supabase
    .from('queries')
    .select('*')
    .eq('engineer_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const queries: Query[] = recentQueries ?? [];
  const totalQueries = queries.length;
  const corrected = queries.filter((q) => q.was_corrected).length;
  const approved = queries.filter((q) => q.selected_sku && !q.was_corrected).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar role={profile?.role as 'engineer' | 'admin'} fullName={profile?.full_name} />

      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back{profile?.full_name ? `, ${profile.full_name}` : ''}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            AI-powered product matching for Axis India
          </p>
        </div>

        {/* CTA */}
        <Link
          href="/query"
          className="mb-8 flex items-center gap-3 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 p-6 hover:border-blue-900 hover:bg-blue-100 transition-colors"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-900 text-white">
            <Search className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-blue-900">New query</p>
            <p className="text-sm text-blue-700">Find matching Axis products from any client description</p>
          </div>
        </Link>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-3 gap-4">
          {[
            { label: 'Queries today', value: totalQueries, icon: Clock, color: 'text-blue-900' },
            { label: 'Approved', value: approved, icon: CheckCircle, color: 'text-green-700' },
            { label: 'Corrected', value: corrected, icon: AlertCircle, color: 'text-amber-700' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className={`mb-1 flex items-center gap-2 text-sm font-medium ${color}`}>
                <Icon className="h-4 w-4" />
                {label}
              </div>
              <div className="text-2xl font-bold text-gray-900">{value}</div>
            </div>
          ))}
        </div>

        {/* Recent queries */}
        {queries.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Recent queries</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {queries.map((q) => (
                <div key={q.id} className="flex items-start justify-between px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-800">{q.raw_query}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {q.country_context && COUNTRY_MAP[q.country_context]
                        ? `${COUNTRY_MAP[q.country_context]} · `
                        : ''}
                      {new Date(q.created_at).toLocaleDateString()}
                      {q.detected_language && ` · ${q.detected_language}`}
                    </p>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    {q.selected_sku && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        q.was_corrected
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {q.was_corrected ? '✗ Corrected' : '✓ Approved'}
                        <span className="font-mono">{q.selected_sku}</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {queries.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 p-10 text-center text-gray-400">
            No queries yet. Start by clicking &ldquo;New query&rdquo; above.
          </div>
        )}
      </main>
    </div>
  );
}
