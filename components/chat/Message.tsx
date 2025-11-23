'use client';

import { getUserColor } from '@/lib/utils/colors';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageProps {
  user_name: string;
  content: string;
  role: 'user' | 'assistant';
  user_id: string;
}

export default function Message({ user_name, content, role, user_id }: MessageProps) {
  const userColor = role === 'assistant' ? '#10b981' : getUserColor(user_id);
  
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 text-sm font-medium mb-1">
        <div 
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: userColor }}
        />
        <span className="text-gray-400" style={{ color: userColor }}>
          {user_name}
        </span>
      </div>
      <div className="text-white prose prose-invert prose-sm max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            h1: ({ children }) => <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0">{children}</h1>,
            h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
            h3: ({ children }) => <h3 className="text-base font-bold mb-1 mt-2 first:mt-0">{children}</h3>,
            ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
            li: ({ children }) => <li className="ml-2">{children}</li>,
            code: ({ inline, children, ...props }) => {
              if (inline) {
                return (
                  <code className="bg-[#2d2d2d] px-1.5 py-0.5 rounded text-sm text-[#ec4899]" {...props}>
                    {children}
                  </code>
                );
              }
              return (
                <code className="block bg-[#2d2d2d] p-3 rounded text-sm overflow-x-auto mb-2" {...props}>
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre className="bg-[#2d2d2d] p-3 rounded text-sm overflow-x-auto mb-2">{children}</pre>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-gray-600 pl-4 my-2 italic text-gray-300">
                {children}
              </blockquote>
            ),
            a: ({ children, href }) => (
              <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
            hr: () => <hr className="my-3 border-[#3d3d3d]" />,
            table: ({ children }) => (
              <div className="overflow-x-auto mb-2">
                <table className="min-w-full border-collapse border border-[#3d3d3d]">
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th className="border border-[#3d3d3d] px-3 py-2 bg-[#2d2d2d] font-semibold text-left">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-[#3d3d3d] px-3 py-2">
                {children}
              </td>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

