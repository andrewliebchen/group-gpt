import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import MobileLayout from '@/components/layout/MobileLayout';

export default async function ThreadsPage() {
  const user = await currentUser();
  if (!user) {
    redirect('/sign-in');
  }

  return (
    <MobileLayout>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white mb-2">
            Welcome to Group GPT
          </h1>
          <p className="text-gray-400">
            Create a new chat to get started.
          </p>
        </div>
      </div>
    </MobileLayout>
  );
}

