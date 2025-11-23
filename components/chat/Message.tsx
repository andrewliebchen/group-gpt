'use client';

import { getUserColor } from '@/lib/utils/colors';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import Link from 'next/link';

interface MessageData {
  id: string;
  user_id: string;
  user_name: string;
  content: string;
  role: 'user' | 'assistant';
  created_at: string;
}

interface MessageProps {
  user_name: string;
  content: string;
  role: 'user' | 'assistant';
  user_id: string;
  current_user_id?: string;
  showThoughts?: boolean;
  onToggleThoughts?: () => void;
  allMessages?: MessageData[];
}

export default function Message({ user_name, content, role, user_id, current_user_id, showThoughts = false, onToggleThoughts, allMessages = [] }: MessageProps) {
  const userColor = role === 'assistant' ? '#10b981' : getUserColor(user_id);
  const isCurrentUser = current_user_id && user_id === current_user_id && role === 'user';
  
  // Build a map of user names to their colors
  const userColorMap = new Map<string, string>();
  allMessages.forEach((msg) => {
    if (msg.role === 'user' && msg.user_id !== 'assistant') {
      const color = getUserColor(msg.user_id);
      userColorMap.set(msg.user_name.toLowerCase(), color);
    }
  });
  
  // Parse [THOUGHT:...] from content
  const thoughtMatch = content.match(/^\[THOUGHT:\s*([\s\S]+?)\]\s*([\s\S]*)$/);
  const thought = thoughtMatch ? thoughtMatch[1].trim() : null;
  let actualContent = thoughtMatch ? thoughtMatch[2].trim() : content;
  const hasThought = thought !== null;
  
  // Create a rehype plugin to process @mentions after markdown parsing
  const mentionPlugin = () => {
    return (tree: any) => {
      const visit = (node: any, parent: any = null) => {
        // Skip code blocks and inline code
        if (node.type === 'element' && (node.tagName === 'code' || node.tagName === 'pre')) {
          return;
        }
        
        if (node.type === 'text' && typeof node.value === 'string') {
          const parts: any[] = [];
          let lastIndex = 0;
          const mentionRegex = /@(\w+)/g;
          let match;
          
          while ((match = mentionRegex.exec(node.value)) !== null) {
            // Add text before the mention
            if (match.index > lastIndex) {
              parts.push({
                type: 'text',
                value: node.value.slice(lastIndex, match.index),
              });
            }
            
            // Get user color
            const username = match[1];
            const mentionColor = userColorMap.get(username.toLowerCase()) || '#3b82f6';
            const hex = mentionColor.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            const bgColor = `rgba(${r}, ${g}, ${b}, 0.2)`;
            
            // Add the mention as a span element
            parts.push({
              type: 'element',
              tagName: 'span',
              properties: {
                className: ['mention'],
                style: `background-color: ${bgColor}; color: ${mentionColor};`,
                'data-hover-bg': `rgba(${r}, ${g}, ${b}, 0.3)`,
              },
              children: [
                {
                  type: 'text',
                  value: `@${username}`,
                },
              ],
            });
            
            lastIndex = mentionRegex.lastIndex;
          }
          
          // Add remaining text
          if (lastIndex < node.value.length) {
            parts.push({
              type: 'text',
              value: node.value.slice(lastIndex),
            });
          }
          
          // Replace the text node with the parts
          if (parts.length > 1) {
            const index = parent.children.indexOf(node);
            parent.children.splice(index, 1, ...parts);
            return;
          }
        }
        
        // Recursively visit children
        if (node.children) {
          for (let i = 0; i < node.children.length; i++) {
            visit(node.children[i], node);
          }
        }
      };
      
      visit(tree);
      return tree;
    };
  };
  
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
        {role === 'assistant' && hasThought && onToggleThoughts && (
          <button
            onClick={onToggleThoughts}
            className="ml-2 text-xs text-gray-500 hover:text-gray-400 transition-colors flex items-center gap-1"
            title={showThoughts ? 'Hide thoughts' : 'Show thoughts'}
          >
            <span className="text-[10px]">💭</span>
            <span className="text-[10px]">{showThoughts ? '−' : '+'}</span>
          </button>
        )}
      </div>
      {hasThought && showThoughts && (
        <div className="mb-2 text-sm text-gray-500 italic">
          {thought}
        </div>
      )}
      <div className="text-white prose prose-invert prose-base max-w-none [&_.mention]:inline-block [&_.mention]:px-1 [&_.mention]:py-0 [&_.mention]:mx-0.5 [&_.mention]:rounded [&_.mention]:font-medium [&_.mention]:transition-colors [&_.mention]:cursor-pointer">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, mentionPlugin]}
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
          {actualContent}
        </ReactMarkdown>
      </div>
    </div>
  );
}

