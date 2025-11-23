import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/sidebar/Sidebar';

export default async function SpacesPage() {
  const user = await currentUser();
  if (!user) {
    redirect('/sign-in');
  }

  return (
    <div className="flex h-screen bg-[#1f1f1f]">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white mb-2">
            Welcome to Group GPT
          </h1>
          <p className="text-gray-400">
            Select a space from the sidebar or create a new one to get started.
          </p>
        </div>
      </div>
    </div>
  );
}

