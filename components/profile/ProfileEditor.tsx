'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

interface ProfileEditorProps {
  userId: string;
}

export default function ProfileEditor({ userId }: ProfileEditorProps) {
  const router = useRouter();
  const [backgroundContext, setBackgroundContext] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('background_context')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Error loading profile:', error);
      } else if (data) {
        setBackgroundContext(data.background_context || '');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('saving');

    try {
      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: userId,
          background_context: backgroundContext.trim() || null,
        }, {
          onConflict: 'user_id',
        });

      if (error) {
        console.error('Error saving profile:', error);
        setSaveStatus('error');
      } else {
        setSaveStatus('saved');
        setTimeout(() => {
          setSaveStatus('idle');
        }, 2000);
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-[#3d3d3d]">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-[#3d3d3d] rounded transition-colors"
            aria-label="Go back"
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h1 className="text-xl md:text-2xl font-semibold text-white">
            Background Context
          </h1>
        </div>
        <p className="text-sm text-gray-400">
          Share information about yourself that will help the AI understand your context and preferences. This will be included in all conversations.
        </p>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col p-4 md:p-6">
        <div className="flex-1 flex flex-col">
          <textarea
            value={backgroundContext}
            onChange={(e) => {
              setBackgroundContext(e.target.value);
              // Auto-resize textarea
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 600)}px`;
            }}
            placeholder="Tell the AI about yourself... For example: your role, interests, preferences, communication style, or any context that would help the AI better understand and assist you."
            className="flex-1 w-full px-4 py-3 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none text-base leading-relaxed"
            style={{ minHeight: '300px' }}
          />
        </div>

        {/* Save button */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-base font-medium transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          {saveStatus === 'saved' && (
            <span className="text-sm text-green-400">Saved!</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-sm text-red-400">Error saving. Please try again.</span>
          )}
        </div>
      </div>
    </div>
  );
}

