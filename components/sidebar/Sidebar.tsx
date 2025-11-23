'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';

interface Space {
  id: string;
  name: string;
  created_at: string;
}

interface Thread {
  id: string;
  title: string | null;
  space_id: string;
  created_at: string;
}

export default function Sidebar() {
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');

  useEffect(() => {
    loadSpaces();
  }, []);

  useEffect(() => {
    if (selectedSpaceId) {
      loadThreads(selectedSpaceId);
    }
  }, [selectedSpaceId]);

  const loadSpaces = async () => {
    const { data, error } = await supabase
      .from('spaces')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setSpaces(data);
      if (data.length > 0 && !selectedSpaceId) {
        setSelectedSpaceId(data[0].id);
      }
    }
  };

  const loadThreads = async (spaceId: string) => {
    const { data, error } = await supabase
      .from('threads')
      .select('*')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setThreads(data);
    }
  };

  const handleCreateSpace = async () => {
    if (!user || !newSpaceName.trim()) return;

    const { data, error } = await supabase
      .from('spaces')
      .insert({
        name: newSpaceName.trim(),
        created_by: user.id,
      })
      .select()
      .single();

    if (!error && data) {
      setSpaces([data, ...spaces]);
      setSelectedSpaceId(data.id);
      setNewSpaceName('');
      setIsCreatingSpace(false);
    }
  };

  const handleCreateThread = async () => {
    if (!user) return;

    // Use selected space or create default if none exists
    let spaceId = selectedSpaceId;
    if (!spaceId) {
      if (spaces.length === 0) {
        const { data: spaceData, error: spaceError } = await supabase
          .from('spaces')
          .insert({
            name: 'Default Space',
            created_by: user.id,
          })
          .select()
          .single();

        if (!spaceError && spaceData) {
          setSpaces([spaceData]);
          spaceId = spaceData.id;
          setSelectedSpaceId(spaceData.id);
        } else {
          return;
        }
      } else {
        spaceId = spaces[0].id;
        setSelectedSpaceId(spaceId);
      }
    }

    const { data, error } = await supabase
      .from('threads')
      .insert({
        space_id: spaceId,
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

      {/* Spaces section */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Spaces
            </h2>
            <button
              onClick={() => setIsCreatingSpace(!isCreatingSpace)}
              className="text-gray-400 hover:text-white"
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
            </button>
          </div>

          {isCreatingSpace && (
            <div className="mb-2">
              <input
                type="text"
                value={newSpaceName}
                onChange={(e) => setNewSpaceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateSpace();
                  }
                }}
                placeholder="Space name"
                className="w-full px-3 py-1.5 bg-[#1f1f1f] border border-[#3d3d3d] rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
          )}

          <div className="space-y-1">
            {spaces.map((space) => (
              <button
                key={space.id}
                onClick={() => setSelectedSpaceId(space.id)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  selectedSpaceId === space.id
                    ? 'bg-[#1f1f1f] text-white'
                    : 'text-gray-300 hover:bg-[#1f1f1f]'
                }`}
              >
                {space.name}
              </button>
            ))}
          </div>
        </div>

        {/* Threads section */}
        {selectedSpaceId && (
          <div className="p-4 border-t border-[#3d3d3d]">
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
        )}
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

