'use client';

import { getUserColor } from '@/lib/utils/colors';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';

interface MessageProps {
  user_name: string;
  content: string;
  role: 'user' | 'assistant';
  user_id: string;
  current_user_id?: string;
}

export default function Message({ user_name, content, role, user_id, current_user_id }: MessageProps) {
  const userColor = role === 'assistant' ? '#10b981' : getUserColor(user_id);
  const isCurrentUser = current_user_id && user_id === current_user_id && role === 'user';
  
  return (
      <div className="mb-6">
      <div className="flex items-center gap-2 text-base font-medium mb-2">
        <div 
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: userColor }}
        />
        {isCurrentUser ? (
          <Link
            href="/profile"
            className="text-gray-400 text-base hover:opacity-80 transition-opacity cursor-pointer"
            style={{ color: userColor }}
          >
            {user_name}
          </Link>
        ) : (
          <span className="text-gray-400 text-base" style={{ color: userColor }}>
            {user_name}
          </span>
        )}
      </div>
      <div className="text-white prose prose-invert prose-base max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-3 last:mb-0 text-base leading-relaxed">{children}</p>,
            h1: ({ children }) => <h1 className="text-2xl font-bold mb-3 mt-6 first:mt-0">{children}</h1>,
            h2: ({ children }) => <h2 className="text-xl font-bold mb-3 mt-5 first:mt-0">{children}</h2>,
            h3: ({ children }) => <h3 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h3>,
            ul: ({ children }) => <ul className="list-disc list-outside mb-3 ml-6 space-y-2">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-outside mb-3 ml-6 space-y-2">{children}</ol>,
            li: ({ children, ...props }: any) => {
              // Flatten nested paragraphs in list items
              const flattenChildren = (node: any): any => {
                if (Array.isArray(node)) {
                  return node.map(flattenChildren);
                }
                if (node && typeof node === 'object' && node.type === 'p') {
                  return node.props.children;
                }
                return node;
              };
              
              const processedChildren = flattenChildren(children);
              return <li className="text-base leading-relaxed my-1" {...props}>{processedChildren}</li>;
            },
            code: ({ className, children, ...props }: any) => {
              const isInline = !className?.includes('language-');
              if (isInline) {
                return (
                  <code className="bg-[#2d2d2d] px-2 py-1 rounded text-base text-[#ec4899]" {...props}>
                    {children}
                  </code>
                );
              }
              return (
                <code className="block bg-[#2d2d2d] p-4 rounded text-base overflow-x-auto mb-3" {...props}>
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre className="bg-[#2d2d2d] p-4 rounded text-base overflow-x-auto mb-3">{children}</pre>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-gray-600 pl-4 my-3 italic text-gray-300 text-base leading-relaxed">
                {children}
              </blockquote>
            ),
            a: ({ children, href }) => (
              <a href={href} className="text-blue-400 hover:text-blue-300 underline text-base" target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
            hr: () => <hr className="my-4 border-[#3d3d3d]" />,
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

