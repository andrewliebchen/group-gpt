import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import MobileLayout from '@/components/layout/MobileLayout';
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
    <MobileLayout>
      <ChatInterface threadId={id} />
    </MobileLayout>
  );
}

