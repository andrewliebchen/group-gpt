'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';

interface Thread {
  id: string;
  title: string | null;
  created_at: string;
}

export default function Sidebar() {
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    loadThreads();
    
    const channel = supabase
      .channel('threads-list')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'threads',
        },
        () => {
          loadThreads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadThreads = async () => {
    const { data, error } = await supabase
      .from('threads')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setThreads(data);
    }
  };

  const handleCreateThread = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('threads')
      .insert({
        title: 'New Chat',
        created_by: user.id,
      })
      .select()
      .single();

    if (!error && data) {
      setThreads([data, ...threads]);
      router.push(`/threads/${data.id}`);
    }
  };

  return (
    <div className="w-64 h-screen bg-[#2d2d2d] border-r border-[#3d3d3d] flex flex-col">
      {/* Top section */}
      <div className="p-4 border-b border-[#3d3d3d]">
        <button
          onClick={handleCreateThread}
          className="w-full px-4 py-2 bg-[#1f1f1f] hover:bg-[#3d3d3d] text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          New chat
        </button>
      </div>

      {/* Threads section */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Threads
          </h2>
          <div className="space-y-1">
            {threads.map((thread) => (
              <Link
                key={thread.id}
                href={`/threads/${thread.id}`}
                className={`block px-3 py-2 rounded text-sm transition-colors ${
                  pathname === `/threads/${thread.id}`
                    ? 'bg-[#1f1f1f] text-white'
                    : 'text-gray-300 hover:bg-[#1f1f1f]'
                }`}
              >
                {thread.title || 'New Chat'}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* User section */}
      {user && (
        <div className="p-4 border-t border-[#3d3d3d]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
              {user.firstName?.[0] || user.emailAddresses[0]?.emailAddress[0].toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white truncate">
                {user.firstName && user.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : user.emailAddresses[0]?.emailAddress}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
