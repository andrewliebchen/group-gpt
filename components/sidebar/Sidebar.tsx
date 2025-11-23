'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import { getUserColor } from '@/lib/utils/colors';

interface Thread {
  id: string;
  title: string | null;
  created_at: string;
  unread_count?: number;
}

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [threads, setThreads] = useState<Thread[]>([]);

  // Close sidebar on mobile when thread is selected
  const handleThreadClick = () => {
    if (window.innerWidth < 768 && onClose) {
      onClose();
    }
  };

  useEffect(() => {
    if (user) {
      loadThreads();
      
      const threadsChannel = supabase
        .channel('threads-list')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'threads',
          },
          (payload) => {
            // Handle different event types
            if (payload.eventType === 'UPDATE' && payload.new) {
              // Update specific thread
              setThreads((prev) =>
                prev.map((t) =>
                  t.id === payload.new.id ? { ...t, ...payload.new } : t
                )
              );
            } else if (payload.eventType === 'INSERT' && payload.new) {
              // Add new thread to the beginning
              setThreads((prev) => {
                const exists = prev.some((t) => t.id === payload.new.id);
                if (exists) return prev;
                return [payload.new as Thread, ...prev];
              });
            } else if (payload.eventType === 'DELETE') {
              // Remove deleted thread
              setThreads((prev) =>
                prev.filter((t) => t.id !== payload.old.id)
              );
            } else {
              // Fallback: reload all threads
              loadThreads();
            }
          }
        )
        .subscribe();

      // Listen for new messages to update unread counts
      const messagesChannel = supabase
        .channel('sidebar-messages')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
          },
          () => {
            // Refresh unread counts when new messages arrive
            loadThreads();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(threadsChannel);
        supabase.removeChannel(messagesChannel);
      };
    }
  }, [user]);

  const loadThreads = async () => {
    if (!user) return;

    const { data: threadsData, error: threadsError } = await supabase
      .from('threads')
      .select('*')
      .order('created_at', { ascending: false });

    if (threadsError) {
      console.error('Error loading threads:', threadsError);
      return;
    }

    if (!threadsData) return;

    // Get unread counts for each thread
    const threadIds = threadsData.map((t) => t.id);
    
    // Get last read times for current user
    const { data: readData } = await supabase
      .from('thread_reads')
      .select('thread_id, last_read_at')
      .eq('user_id', user.id)
      .in('thread_id', threadIds);

    const lastReadMap = new Map(
      readData?.map((r) => [r.thread_id, new Date(r.last_read_at)]) || []
    );

    // Count unread messages for each thread
    const threadsWithUnread = await Promise.all(
      threadsData.map(async (thread) => {
        const lastRead = lastReadMap.get(thread.id);
        
        let query = supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('thread_id', thread.id);

        if (lastRead) {
          query = query.gt('created_at', lastRead.toISOString());
        }

        const { count } = await query;
        
        return {
          ...thread,
          unread_count: count || 0,
        };
      })
    );

    setThreads(threadsWithUnread);
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
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed md:static inset-y-0 left-0 w-64 h-screen bg-[#2d2d2d] border-r border-[#3d3d3d] flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
      {/* Top section */}
      <div className="px-3 md:px-4 pt-3 md:pt-4 pb-0">
        {/* Mobile close button */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={onClose}
            className="md:hidden p-2 hover:bg-[#1f1f1f] rounded transition-colors"
            aria-label="Close sidebar"
          >
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <button
          onClick={handleCreateThread}
          className="w-full px-3 py-2.5 text-gray-300 hover:bg-[#1f1f1f] hover:text-white rounded text-base transition-colors flex items-center gap-2 cursor-pointer"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <rect
              x="3"
              y="3"
              width="18"
              height="18"
              rx="2"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v8m-4-4h8"
            />
          </svg>
          New chat
        </button>
      </div>

      {/* Threads section */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 md:px-4 pt-4 pb-3 md:pb-4">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 px-3">
            Chats
          </h2>
          <div className="space-y-1">
            {threads.map((thread) => {
              const isActive = pathname === `/threads/${thread.id}`;
              
              return (
                <Link
                  key={thread.id}
                  href={`/threads/${thread.id}`}
                  onClick={handleThreadClick}
                  className={`block px-3 py-2.5 rounded text-base transition-colors relative cursor-pointer ${
                    isActive
                      ? 'bg-[#1f1f1f] text-white'
                      : 'text-gray-300 hover:bg-[#1f1f1f]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex-1 truncate">
                      {thread.title || 'New Chat'}
                    </span>
                    {thread.unread_count && thread.unread_count > 0 ? (
                      <span className="flex-shrink-0 bg-blue-600 text-white text-sm font-medium px-2.5 py-1 rounded-full min-w-[24px] text-center">
                        {thread.unread_count > 99 ? '99+' : thread.unread_count}
                      </span>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* User section */}
      {user && (
        <div className="p-3 md:p-4 border-t border-[#3d3d3d]">
          <Link
            href="/profile"
            onClick={handleThreadClick}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
              style={{ backgroundColor: getUserColor(user.id) }}
            >
              {user.firstName?.[0] || user.emailAddresses[0]?.emailAddress[0].toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white truncate">
                {user.firstName && user.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : user.emailAddresses[0]?.emailAddress}
              </div>
            </div>
          </Link>
        </div>
      )}
      </div>
    </>
  );
}
