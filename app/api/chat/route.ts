import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { threadId, message, userId, userName } = await req.json();

    if (!message || !threadId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get current thread messages
    const { data: currentMessages, error: currentError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (currentError) {
      console.error('Error fetching current messages:', currentError);
      return new Response(JSON.stringify({ error: 'Error fetching messages', details: currentError.message }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get recent messages from other threads for background context (limit to most recent 30 messages)
    const { data: allOtherMessages, error: otherError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .neq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (otherError) {
      console.error('Error fetching other messages:', otherError);
      // Continue without background context if this fails
    }

    // Get all unique user IDs from current thread messages
    const userIds = new Set<string>();
    currentMessages?.forEach((msg) => {
      if (msg.user_id && msg.user_id !== 'assistant') {
        userIds.add(msg.user_id);
      }
    });
    // Also include the current user
    if (userId) {
      userIds.add(userId);
    }

    // Fetch background contexts for all users in the conversation
    const { data: userProfiles, error: profilesError } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id, background_context')
      .in('user_id', Array.from(userIds));

    if (profilesError) {
      console.error('Error fetching user profiles:', profilesError);
      // Continue without user background contexts if this fails
    }

    // Format current thread messages (emphasized - this is the active conversation)
    const currentThreadHistory: Array<{ role: 'user' | 'assistant'; content: string }> = 
      currentMessages?.map((msg) => ({
        role: (msg.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: msg.content as string,
      })) || [];

    // Format background context from other threads (reverse to chronological order)
    const backgroundContext: Array<{ role: 'user' | 'assistant'; content: string }> = 
      allOtherMessages?.reverse().map((msg) => ({
        role: (msg.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: msg.content as string,
      })) || [];

    // Format user background contexts
    const userBackgroundContexts = userProfiles
      ?.filter((profile) => profile.background_context && profile.background_context.trim())
      .map((profile) => {
        // Get user name from messages for better context
        const userMessage = currentMessages?.find((msg) => msg.user_id === profile.user_id);
        const userName = userMessage?.user_name || `User ${profile.user_id.substring(0, 8)}`;
        return {
          userName,
          context: profile.background_context as string,
        };
      }) || [];

    // Create a readable stream
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Build system prompt with personality
          const systemPrompt = `You are a personable, interested, and interesting AI assistant participating in a collaborative group chat. You have access to the current conversation thread (which you should focus on) and background context from other conversations in this space.

Your personality and approach:
- Be genuinely interested in the conversation and the people you're talking with
- Be helpful, insightful, and engaging - like a thoughtful colleague or friend who's genuinely engaged
- Be PRECISE and CONCISE - get to the point quickly, avoid unnecessary verbosity, and be direct
- Find natural ways to move conversations forward and explore interesting directions
- Reference relevant background context when it adds value, but always keep the primary focus on the current conversation
- Be conversational, personable, and show genuine curiosity - but keep it brief
- Help facilitate productive and interesting discussions

Communication style:
- Prioritize clarity and brevity
- Get to the point without excessive preamble
- Be thorough when needed, but concise by default
- Avoid filler words and unnecessary elaboration
- Make every word count

CURRENT CONVERSATION (this is the active thread - focus here):
${currentThreadHistory.length > 0 ? currentThreadHistory.map((msg) => 
  `${msg.role === 'user' ? 'User' : 'You'}: ${msg.content}`
).join('\n\n') : 'This is the start of a new conversation.'}

${backgroundContext.length > 0 ? `\nBACKGROUND CONTEXT from other conversations (use sparingly for reference only - don't let it distract from current conversation):\n${backgroundContext.map((msg) => 
  `[Other thread] ${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
).join('\n\n')}` : ''}

${userBackgroundContexts.length > 0 ? `\nUSER BACKGROUND CONTEXTS (information about the people in this conversation):\n${userBackgroundContexts.map((profile) => 
  `${profile.userName}: ${profile.context}`
).join('\n\n')}` : ''}

Remember: The current conversation above is your primary focus. Use background context only when it genuinely helps you be more helpful or informed. Be personable, interested, and help move the conversation forward in engaging ways - but always be precise and concise.`;

          const completion = await openai.chat.completions.create({
            model: 'gpt-5.1-2025-11-13',
            messages: [
              { role: 'system', content: systemPrompt },
              ...currentThreadHistory,
              { role: 'user', content: message },
            ],
            stream: true,
          });

          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              const data = JSON.stringify({ content });
              controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            }
          }

          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error: any) {
          console.error('OpenAI API error:', error);
          const errorMessage = error?.message || 'Unknown error';
          const errorData = JSON.stringify({ error: 'OpenAI API error', details: errorMessage });
          controller.enqueue(new TextEncoder().encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error', 
      details: error?.message || 'Unknown error' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

