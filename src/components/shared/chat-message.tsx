'use client';

import { Bot } from 'lucide-react';

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
      <div className="flex gap-3 items-start">
        <div className="flex-shrink-0 p-2 rounded-lg bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div className="bg-muted/50 rounded-xl px-4 py-3">
          <div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-primary/50 typing-dot" />
            <div className="w-2 h-2 rounded-full bg-primary/50 typing-dot" />
            <div className="w-2 h-2 rounded-full bg-primary/50 typing-dot" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 items-start ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex-shrink-0 p-2 rounded-lg ${isUser ? 'bg-primary/20' : isSystem ? 'bg-yellow-500/10' : 'bg-primary/10'}`}>
        {isUser ? (
          <div className="h-4 w-4 rounded-full bg-primary/60" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
        )}
      </div>
      <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
        isUser
          ? 'bg-primary text-primary-foreground'
          : isSystem
            ? 'bg-yellow-500/10 border border-yellow-500/20'
            : 'bg-muted/50 border border-border/50'
      }`}>
        <p className="whitespace-pre-wrap break-words">{content}</p>
        {timestamp && (
          <p className={`text-[10px] mt-1 ${isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
            {new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}
