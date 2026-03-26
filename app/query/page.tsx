import { createServerSupabaseClient } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import QueryPageClient from './QueryPageClient';

export default async function QueryPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('users_profile')
    .select('full_name, role')
    .eq('id', user!.id)
    .single();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar role={profile?.role as 'engineer' | 'admin'} fullName={profile?.full_name} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Product Matcher</h1>
          <p className="mt-1 text-sm text-gray-500">
            Paste a client query in any language — competitor references, descriptions, or part numbers.
          </p>
        </div>
        <QueryPageClient engineerId={user!.id} />
      </main>
    </div>
  );
}
