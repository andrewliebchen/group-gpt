'use client';

interface MessageProps {
  user_name: string;
  content: string;
  role: 'user' | 'assistant';
}

export default function Message({ user_name, content, role }: MessageProps) {
  return (
    <div className="mb-6">
      <div className="text-sm font-medium text-gray-400 mb-1">{user_name}</div>
      <div className="text-white whitespace-pre-wrap">{content}</div>
    </div>
  );
}

