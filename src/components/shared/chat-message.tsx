'use client';

import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  isLoading?: boolean;
}

export function ChatMessage({ role, content, timestamp, isLoading }: ChatMessageProps) {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  if (isLoading) {
    return (
      <div className="flex gap-3 items-start chat-typing-container">
        <div className="relative flex-shrink-0">
          <div className="absolute -inset-[2px] rounded-xl bg-gradient-to-br from-[#06b6d4] to-violet-500 opacity-60 blur-sm" />
          <div className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-white/20 bg-slate-900">
            <Bot className="h-4 w-4 text-[#00F5FF]" />
          </div>
        </div>
        <div className="bg-muted/50 rounded-2xl rounded-tl-md border border-white/10 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#06b6d4]/60 typing-dot" />
            <div className="w-2 h-2 rounded-full bg-[#06b6d4]/60 typing-dot" />
            <div className="w-2 h-2 rounded-full bg-[#06b6d4]/60 typing-dot" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('group flex items-start gap-3', isUser ? 'flex-row-reverse' : '', isUser ? 'chat-msg-user-enter' : 'chat-msg-agent-enter')}>
      <div
        className={cn(
          'relative flex-shrink-0 transition-transform duration-200 hover:scale-105',
          isUser && 'order-2',
        )}
      >
        <div className="absolute -inset-[2px] rounded-xl opacity-60 blur-sm bg-gradient-to-br from-[#06b6d4] to-violet-500" />
        <div
          className={cn(
            'relative flex h-8 w-8 items-center justify-center rounded-xl border border-white/20',
            isSystem ? 'bg-amber-500/15' : 'bg-slate-900',
          )}
        >
          {isUser ? (
            <div className="h-4 w-4 rounded-full bg-gradient-to-br from-[#06b6d4] to-[#0891b2] shadow" />
          ) : isSystem ? (
            <span className="h-4 w-4 rounded-full border-2 border-amber-400/70" />
          ) : (
            <Bot className={cn('h-4 w-4', isSystem ? 'text-amber-300' : 'text-[#00F5FF]')} />
          )}
        </div>
      </div>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3 text-sm chat-msg-bubble border',
          isUser
            ? 'order-1 rounded-tr-md bg-gradient-to-br from-[#06b6d4] to-[#0891b2] text-white border-transparent shadow-lg shadow-[#06b6d4]/10'
            : isSystem
              ? 'rounded-tl-md bg-amber-500/10 border-amber-500/20 backdrop-blur-xl'
              : 'rounded-tl-md bg-muted/50 border-white/10 backdrop-blur-xl',
        )}
      >
        <p className="whitespace-pre-wrap break-words">{content}</p>
        {timestamp && (
          <p className={cn('text-[10px] mt-1', isUser ? 'text-white/60' : 'text-muted-foreground')}>
            {new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}
