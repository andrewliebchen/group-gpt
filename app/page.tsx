import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';

export default async function Home() {
  const user = await currentUser();
  
  if (user) {
    // Redirect to threads page or create a new thread
    redirect('/threads');
  } else {
    redirect('/sign-in');
  }
}
