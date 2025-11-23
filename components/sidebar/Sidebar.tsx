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
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');

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

  const handleSaveThreadTitle = async (threadId: string) => {
    if (!editingTitle.trim()) {
      setEditingThreadId(null);
      setEditingTitle('');
      return;
    }

    const newTitle = editingTitle.trim();
    
    // Close editing first
    setEditingThreadId(null);
    setEditingTitle('');

    // Optimistically update the UI
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, title: newTitle } : t))
    );

    // Save to database
    const { data, error } = await supabase
      .from('threads')
      .update({ title: newTitle })
      .eq('id', threadId)
      .select()
      .single();

    if (error) {
      console.error('Error saving thread title:', error);
      // Reload threads on error to get correct state
      loadThreads();
    } else if (data) {
      // Update with the actual data from the database to ensure consistency
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, title: data.title } : t))
      );
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
      <div className="p-3 md:p-4 border-b border-[#3d3d3d] flex items-center gap-2">
        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="md:hidden p-2 hover:bg-[#3d3d3d] rounded transition-colors"
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
        <button
          onClick={handleCreateThread}
          className="flex-1 px-4 py-2 bg-[#1f1f1f] hover:bg-[#3d3d3d] text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
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
        <div className="p-3 md:p-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Threads
          </h2>
          <div className="space-y-1">
            {threads.map((thread) => {
              const isEditing = editingThreadId === thread.id;
              const isActive = pathname === `/threads/${thread.id}`;
              
              return (
                isEditing ? (
                  <div
                    key={thread.id}
                    className={`px-3 py-2 rounded text-sm ${
                      isActive
                        ? 'bg-[#1f1f1f] text-white'
                        : 'text-gray-300'
                    }`}
                  >
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          await handleSaveThreadTitle(thread.id);
                        } else if (e.key === 'Escape') {
                          setEditingThreadId(null);
                          setEditingTitle('');
                        }
                      }}
                      onBlur={async () => {
                        await handleSaveThreadTitle(thread.id);
                      }}
                      className="w-full bg-[#2d2d2d] border border-[#3d3d3d] rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
                      autoFocus
                    />
                  </div>
                ) : (
                  <Link
                    key={thread.id}
                    href={`/threads/${thread.id}`}
                    onClick={handleThreadClick}
                    className={`block px-3 py-2.5 rounded text-base transition-colors relative ${
                      isActive
                        ? 'bg-[#1f1f1f] text-white'
                        : 'text-gray-300 hover:bg-[#1f1f1f]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="cursor-text flex-1 truncate"
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingThreadId(thread.id);
                          setEditingTitle(thread.title || 'New Chat');
                        }}
                      >
                        {thread.title || 'New Chat'}
                      </span>
                      {thread.unread_count && thread.unread_count > 0 ? (
                        <span className="flex-shrink-0 bg-blue-600 text-white text-sm font-medium px-2.5 py-1 rounded-full min-w-[24px] text-center">
                          {thread.unread_count > 99 ? '99+' : thread.unread_count}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                )
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
