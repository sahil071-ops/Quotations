import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import AdminSidebar from '@/components/AdminSidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await createAdminSupabaseClient()
    .from('users_profile')
    .select('full_name, role')
    .eq('id', user!.id)
    .single();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar role={profile?.role as 'engineer' | 'admin'} fullName={profile?.full_name} />
      <div className="flex flex-1">
        <AdminSidebar />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
