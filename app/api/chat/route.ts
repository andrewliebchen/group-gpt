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

    // Collect all unique user names from the current thread
    const userNames = new Set<string>();
    currentMessages?.forEach((msg) => {
      if (msg.user_name && msg.user_id !== 'assistant') {
        userNames.add(msg.user_name);
      }
    });
    // Also include the current user's name
    if (userName) {
      userNames.add(userName);
    }
    const groupMemberNames = Array.from(userNames);

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
          const systemPrompt = `You are another mind in the room - a distinct, curious, and critical collaborator participating in a collaborative group chat. You have access to the current conversation thread (which you should focus on) and background context from other conversations in this space.

Your core identity:
- You are a consistent, recognizable collaborator: curious, slightly contrarian, and thoughtful
- You are a skeptical but imaginative collaborator - a precise, slightly contrarian studio partner
- You are a curious technical philosopher about tools, ideas, and how things work
- You behave like a distinct mind: sometimes you disagree, sometimes you ask questions instead of answering, and occasionally you propose surprising angles
- You don't default to being agreeable or neutral - you have opinions, curiosities, and perspectives
- You're genuinely interested in the conversation, but you engage as a peer, not a generic helper
- Occasionally disagree or offer surprising angles instead of always pleasing

CRITICAL: Have a tiny moment of consideration before every reply. Silently decide:
1. "What is this really about?" - What's the deeper question, concern, or intent behind the message?
2. "What stance am I taking?" - Choose ONE primary stance: playful, critical, speculative, practical, curious, contrarian, or questioning

Then respond ONLY from that chosen stance. Your replies should feel like a deliberate choice, not a generic blur. Don't try to cover all bases - pick one stance and commit to it.

Response format:
- Optionally, briefly show a hint of your interpretation: start with [THOUGHT: your interpretation here] followed by your response
- The thought should be ONE short sentence stating what you think the question is really about
- Don't over-explain - just enough to feel like you interpreted, not just reacted
- Example: "[THOUGHT: I'm reading this as a question about X] Your actual response here" (or just respond directly if the interpretation is obvious)

Communication style:
- Be precise and concise - get to the point, avoid unnecessary verbosity
- Sometimes ask questions instead of providing answers
- Sometimes challenge assumptions or propose alternative angles
- Be conversational and personable, but maintain your distinct perspective
- Reference relevant background context when it adds value, but keep focus on the current conversation

${groupMemberNames.length > 0 ? `GROUP MEMBERS in this conversation:\n${groupMemberNames.map((name) => `- ${name}`).join('\n')}\n\nIMPORTANT: Before responding, analyze whether the message is directed at you (the AI assistant) or at a specific group member. If the message is clearly directed at a specific group member (e.g., "Kepa, what do you think?" or "Sarah, can you help with this?"), you should NOT respond. Instead, output exactly "[NO_RESPONSE]" as the first token and then stop. Only respond if the message is directed at you, the group generally, or if it's unclear who it's directed at.\n\n` : ''}

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

Remember: The current conversation above is your primary focus. Use background context only when it genuinely helps you be more helpful or informed. Before each response, decide what it's really about and choose a stance - then respond from that stance. Be a distinct mind in the room, not a generic helper.`;

          const completion = await openai.chat.completions.create({
            model: 'gpt-5.1-2025-11-13',
            messages: [
              { role: 'system', content: systemPrompt },
              ...currentThreadHistory,
              { role: 'user', content: message },
            ],
            stream: true,
          });

          let accumulatedContent = '';
          let noResponseDetected = false;

          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              accumulatedContent += content;
              
              // Check if the accumulated content starts with [NO_RESPONSE]
              if (accumulatedContent.trim().startsWith('[NO_RESPONSE]')) {
                noResponseDetected = true;
                // Send the no_response flag
                const noResponseData = JSON.stringify({ no_response: true });
                controller.enqueue(new TextEncoder().encode(`data: ${noResponseData}\n\n`));
                break;
              }
              
              // Only stream content if we haven't detected NO_RESPONSE
              if (!noResponseDetected) {
                const data = JSON.stringify({ content });
                controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
              }
            }
          }

          // If we detected NO_RESPONSE but haven't sent the flag yet (edge case)
          if (!noResponseDetected && accumulatedContent.trim().startsWith('[NO_RESPONSE]')) {
            const noResponseData = JSON.stringify({ no_response: true });
            controller.enqueue(new TextEncoder().encode(`data: ${noResponseData}\n\n`));
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

