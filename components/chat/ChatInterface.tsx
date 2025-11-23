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
  const [streamingContent, setStreamingContent] = useState('');

  useEffect(() => {
    if (threadId) {
      loadMessages();
      const unsubscribe = subscribeToMessages();
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [threadId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

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
            return [...prev, payload.new as MessageData];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !user || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    setStreamingContent('');

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
                if (parsed.content) {
                  assistantContent += parsed.content;
                  setStreamingContent(assistantContent);
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      }

      // Save assistant message
      if (assistantContent) {
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
      {/* Messages area - scrollable */}
      <div className="flex-1 overflow-y-auto p-6 pb-32">
        <div className="max-w-4xl mx-auto">
          {messages.map((message) => (
            <Message
              key={message.id}
              user_name={message.user_name}
              content={message.content}
              role={message.role}
              user_id={message.user_id}
            />
          ))}
          {streamingContent && (
            <Message
              user_name="GPT-5.1"
              content={streamingContent}
              role="assistant"
              user_id="assistant"
            />
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area - fixed at bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-[#1f1f1f]">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything"
              disabled={isLoading}
              className="w-full px-4 py-3 pr-20 bg-[#2d2d2d] border border-[#3d3d3d] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
            >
              {isLoading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

