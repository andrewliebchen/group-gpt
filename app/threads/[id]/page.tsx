import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/sidebar/Sidebar';
import ChatInterface from '@/components/chat/ChatInterface';

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) {
    redirect('/sign-in');
  }

  const { id } = await params;

  return (
    <div className="flex h-screen bg-[#1f1f1f]">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <ChatInterface threadId={id} />
      </div>
    </div>
  );
}

