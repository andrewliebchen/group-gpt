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
      return new Response('Missing required fields', { status: 400 });
    }

    // Get conversation history
    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return new Response('Error fetching messages', { status: 500 });
    }

    // Format messages for OpenAI
    const conversationHistory = messages?.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    })) || [];

    // Create a readable stream
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const completion = await openai.chat.completions.create({
            model: 'gpt-5.1-2025-11-13',
            messages: [
              ...conversationHistory,
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
        } catch (error) {
          console.error('OpenAI API error:', error);
          controller.error(error);
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
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

