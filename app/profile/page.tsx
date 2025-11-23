import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import MobileLayout from '@/components/layout/MobileLayout';
import ProfileEditor from '@/components/profile/ProfileEditor';

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) {
    redirect('/sign-in');
  }

  return (
    <MobileLayout>
      <ProfileEditor userId={user.id} />
    </MobileLayout>
  );
}

