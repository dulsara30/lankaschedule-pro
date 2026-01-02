import { Sidebar } from '@/components/dashboard/Sidebar';
import { UserMenu } from '@/components/dashboard/UserMenu';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-900">
      <Sidebar />
      <main className="flex-1 overflow-y-auto flex flex-col">
        {/* Top Bar with User Menu */}
        <div className="border-b-2 border-black bg-white px-6 py-4 flex items-center justify-end">
          <UserMenu />
        </div>
        
        {/* Main Content */}
        <div className="flex-1 p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
