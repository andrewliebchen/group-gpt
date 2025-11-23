'use client';

import { useState, useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { supabase } from '@/lib/supabase/client';
import Message from './Message';

interface MessageData {
  id: string;
  user_id: string;
  user_name: string;
  content: string;
  role: 'user' | 'assistant';
  created_at: string;
}

interface ChatInterfaceProps {
  threadId: string;
}

export default function ChatInterface({ threadId }: ChatInterfaceProps) {
  const { user } = useUser();
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [noResponseMessageIds, setNoResponseMessageIds] = useState<Set<string>>(new Set());
  const [threadTitle, setThreadTitle] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [showThoughts, setShowThoughts] = useState(false);

  useEffect(() => {
    if (threadId && user) {
      loadMessages();
      loadThreadTitle();
      const unsubscribe = subscribeToMessages();
      const unsubscribeThread = subscribeToThread();
      setupTypingIndicator();
      markThreadAsRead();
      return () => {
        if (unsubscribe) unsubscribe();
        if (unsubscribeThread) unsubscribeThread();
        cleanupTypingIndicator();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, user?.id]);

  const markThreadAsRead = async () => {
    if (!user || !threadId) return;

    // Upsert the read timestamp
    await supabase
      .from('thread_reads')
      .upsert({
        user_id: user.id,
        thread_id: threadId,
        last_read_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,thread_id',
      });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, typingUsers]);

  // Set initial textarea height to 2 lines
  useEffect(() => {
    if (textareaRef.current) {
      const lineHeight = parseFloat(getComputedStyle(textareaRef.current).lineHeight) || 24;
      const padding = parseFloat(getComputedStyle(textareaRef.current).paddingTop) + parseFloat(getComputedStyle(textareaRef.current).paddingBottom);
      const twoLineHeight = (lineHeight * 2) + padding;
      textareaRef.current.style.height = `${twoLineHeight}px`;
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data);
    }
  };

  const loadThreadTitle = async () => {
    const { data, error } = await supabase
      .from('threads')
      .select('title')
      .eq('id', threadId)
      .single();

    if (!error && data) {
      setThreadTitle(data.title);
    }
  };

  const subscribeToMessages = () => {
    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          setMessages((prev) => {
            // Avoid duplicates
            const exists = prev.some((msg) => msg.id === payload.new.id);
            if (exists) return prev;
            const newMessages = [...prev, payload.new as MessageData];
            // Mark thread as read when new message arrives (if user is viewing)
            if (payload.new.role === 'assistant' || payload.new.user_id !== user?.id) {
              markThreadAsRead();
            }
            return newMessages;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const subscribeToThread = () => {
    const channel = supabase
      .channel(`thread-title:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'threads',
          filter: `id=eq.${threadId}`,
        },
        (payload) => {
          if (payload.new && payload.new.title) {
            setThreadTitle(payload.new.title);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleSaveThreadTitle = async () => {
    if (!editingTitle.trim()) {
      setIsEditingTitle(false);
      setEditingTitle('');
      return;
    }

    const newTitle = editingTitle.trim();
    
    // Close editing first
    setIsEditingTitle(false);
    setEditingTitle('');

    // Optimistically update the UI
    setThreadTitle(newTitle);

    // Save to database
    const { data, error } = await supabase
      .from('threads')
      .update({ title: newTitle })
      .eq('id', threadId)
      .select()
      .single();

    if (error) {
      console.error('Error saving thread title:', error);
      // Reload title on error to get correct state
      loadThreadTitle();
    } else if (data) {
      // Update with the actual data from the database to ensure consistency
      setThreadTitle(data.title);
    }
  };

  const setupTypingIndicator = () => {
    if (!user) return;

    const channel = supabase.channel(`typing:${threadId}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    // Listen for typing events from other users
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const typing = new Set<string>();
      
      Object.values(state).forEach((presences: unknown) => {
        if (Array.isArray(presences)) {
          presences.forEach((presence: { typing?: boolean; userId?: string; userName?: string }) => {
            if (presence.typing && presence.userId !== user.id) {
              typing.add(presence.userName || presence.userId || '');
            }
          });
        }
      });
      
      setTypingUsers(typing);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          userId: user.id,
          userName: user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.emailAddresses[0]?.emailAddress || 'User',
          typing: false,
        });
      }
    });

    typingChannelRef.current = channel;
  };

  const cleanupTypingIndicator = () => {
    if (typingChannelRef.current) {
      typingChannelRef.current.unsubscribe();
      supabase.removeChannel(typingChannelRef.current);
      typingChannelRef.current = null;
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleTyping = () => {
    if (!user || !typingChannelRef.current) return;

    // Send typing event
    typingChannelRef.current.track({
      userId: user.id,
      userName: user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.emailAddresses[0]?.emailAddress || 'User',
      typing: true,
    });

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      if (typingChannelRef.current) {
        typingChannelRef.current.track({
          userId: user.id,
          userName: user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.emailAddresses[0]?.emailAddress || 'User',
          typing: false,
        });
      }
    }, 3000);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || !user || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    setStreamingContent('');

    // Stop typing indicator
    if (typingChannelRef.current && user) {
      typingChannelRef.current.track({
        userId: user.id,
        userName: user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.emailAddresses[0]?.emailAddress || 'User',
        typing: false,
      });
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    const userName = user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.emailAddresses[0]?.emailAddress || 'User';

    // Save user message
    const { data: userMessageData, error: userError } = await supabase
      .from('messages')
      .insert({
        thread_id: threadId,
        user_id: user.id,
        user_name: userName,
        content: userMessage,
        role: 'user',
      })
      .select()
      .single();

    if (userError) {
      console.error('Error saving user message:', userError);
      setIsLoading(false);
      return;
    }

    // Add user message to state immediately
    if (userMessageData) {
      setMessages((prev) => {
        const exists = prev.some((msg) => msg.id === userMessageData.id);
        if (exists) return prev;
        return [...prev, userMessageData as MessageData];
      });
    }

    // Update thread title if this is the first message and title is still "New Chat"
    const { data: threadData } = await supabase
      .from('threads')
      .select('title')
      .eq('id', threadId)
      .single();

    if (threadData && (!threadData.title || threadData.title === 'New Chat')) {
      const title = userMessage.length > 50
        ? userMessage.substring(0, 50) + '...'
        : userMessage;
      await supabase
        .from('threads')
        .update({ title })
        .eq('id', threadId);
      setThreadTitle(title);
    }

    // Call OpenAI API
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threadId,
          message: userMessage,
          userId: user.id,
          userName,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response from OpenAI');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let shouldNotRespond = false;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter((line) => line.trim() !== '');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                break;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.no_response) {
                  shouldNotRespond = true;
                  // Mark this user message as having triggered a no-response
                  if (userMessageData?.id) {
                    setNoResponseMessageIds((prev) => new Set(prev).add(userMessageData.id));
                  }
                  break;
                }
                if (parsed.content) {
                  assistantContent += parsed.content;
                  setStreamingContent(assistantContent);
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
          
          if (shouldNotRespond) {
            break;
          }
        }
      }

      // Save assistant message only if GPT decided to respond
      if (assistantContent && !shouldNotRespond) {
        const { data: assistantMessage, error: assistantError } = await supabase
          .from('messages')
          .insert({
            thread_id: threadId,
            user_id: 'assistant',
            user_name: 'GPT-5.1',
            content: assistantContent,
            role: 'assistant',
          })
          .select()
          .single();

        if (!assistantError && assistantMessage) {
          // Add the message directly to state to avoid it disappearing
          setMessages((prev) => {
            const exists = prev.some((msg) => msg.id === assistantMessage.id);
            if (exists) return prev;
            return [...prev, assistantMessage as MessageData];
          });
        }
      }

      setStreamingContent('');
    } catch (error) {
      console.error('Error calling OpenAI:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen relative">
      {/* Thread title */}
      {threadTitle && (
        <div className="px-4 md:px-6 h-14 bg-[#2a2a2a] flex items-center">
          <div className="max-w-4xl mx-auto w-full">
            {isEditingTitle ? (
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveThreadTitle();
                  } else if (e.key === 'Escape') {
                    setIsEditingTitle(false);
                    setEditingTitle('');
                  }
                }}
                onBlur={handleSaveThreadTitle}
                className="w-full bg-[#1f1f1f] border border-[#3d3d3d] rounded px-3 py-1.5 text-xl font-semibold text-white focus:outline-none focus:border-blue-500"
                autoFocus
              />
            ) : (
              <h1
                className="text-xl font-semibold text-white cursor-text"
                onDoubleClick={() => {
                  setIsEditingTitle(true);
                  setEditingTitle(threadTitle);
                }}
              >
                {threadTitle}
              </h1>
            )}
          </div>
        </div>
      )}
      {/* Messages area - scrollable */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-28 md:pb-32">
        <div className="max-w-4xl mx-auto">
          {messages.map((message) => (
            <div key={message.id}>
              <Message
                user_name={message.user_name}
                content={message.content}
                role={message.role}
                user_id={message.user_id}
                current_user_id={user?.id}
                showThoughts={showThoughts}
                onToggleThoughts={message.role === 'assistant' ? () => setShowThoughts(!showThoughts) : undefined}
                allMessages={messages}
              />
              {message.role === 'user' && noResponseMessageIds.has(message.id) && (
                <div className="mb-6">
                  <div className="text-xs text-gray-500 italic">
                    GPT decided not to answer
                  </div>
                </div>
              )}
            </div>
          ))}
          {streamingContent && (
            <Message
              user_name="GPT-5.1"
              content={streamingContent}
              role="assistant"
              user_id="assistant"
              current_user_id={user?.id}
              showThoughts={showThoughts}
              onToggleThoughts={() => setShowThoughts(!showThoughts)}
              allMessages={messages}
            />
          )}
          {typingUsers.size > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-400 italic">
                <div className="flex gap-1">
                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span>
                  {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area - fixed at bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-3 pt-0 md:p-4 bg-[#1f1f1f]">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="relative flex items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize textarea - initial height is 2 lines, then grow beyond that
                const textarea = e.target;
                const lineHeight = textareaRef.current 
                  ? parseFloat(getComputedStyle(textareaRef.current).lineHeight) || 24
                  : 24;
                const padding = parseFloat(getComputedStyle(textarea).paddingTop) + parseFloat(getComputedStyle(textarea).paddingBottom);
                const twoLineHeight = (lineHeight * 2) + padding;
                
                textarea.style.height = 'auto';
                const scrollHeight = textarea.scrollHeight;
                // Keep at 2-line height minimum, then grow beyond that
                const newHeight = scrollHeight > twoLineHeight 
                  ? Math.min(scrollHeight, 200) 
                  : twoLineHeight;
                textarea.style.height = `${newHeight}px`;
                // Send typing indicator
                handleTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const form = e.currentTarget.form;
                  if (form) {
                    form.requestSubmit();
                  }
                }
              }}
              placeholder="Ask anything"
              disabled={isLoading}
              rows={1}
              className="w-full px-3 md:px-4 py-2.5 md:py-3 pr-16 md:pr-20 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50 resize-none overflow-y-auto max-h-[200px] text-base"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 bottom-2 px-3 md:px-4 py-1.5 md:py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm md:text-base font-medium transition-colors"
            >
              {isLoading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

