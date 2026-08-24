// ============================================================
// @deprecated — Ce composant n'est plus utilisé.
//  Utiliser src/components/chat/chat-panel.tsx à la place.
//  ChatPanel unifie l'ancien ChatTab (agents-view) et ChatInterface,
//  avec persistance des conversations et sidebar.
//
//  Ce fichier est conservé temporairement pour référence.
//  Il sera supprimé dans une prochaine version.
// ============================================================

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ConversationAd } from '@/components/advertising/conversation-ad';

// ============================================================
// Types
// ============================================================

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  metadata?: {
    model?: string;
    tokens?: number;
    durationMs?: number;
  };
}

interface Agent {
  id: string;
  name: string;
  avatar?: string;
  model?: string;
}

interface ChatInterfaceProps {
  userId: string;
  sessionId: string;
  conversationId?: string;
  agent: Agent;
  initialMessages?: Message[];
  /** Plan utilisateur — utilisé pour le footer informatif. */
  plan?: string;
}

// ============================================================
// Chat Interface Component
// ============================================================

export function ChatInterface({
  userId,
  sessionId,
  conversationId,
  agent,
  initialMessages = [],
  plan = 'free',
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Ads are now shown after EVERY AI agent response for ALL plans.
  // The server (ad-engine) decides whether to actually serve an ad
  // based on the user's plan + preferences. Free users always see
  // an unrewarded ad; paid users see a rewarded ad unless they have
  // opted out (in which case the engine returns shouldShow=false and
  // the component renders nothing).
  const showAds = true;

  // Auto-scroll vers le bas
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Focus input au montage
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Extraction de mots-cles pour le ciblage pub
  const extractKeywords = useCallback((text: string): string[] => {
    const stopWords = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou', 'mais', 'donc', 'car', 'ni', 'or', 'avec', 'est', 'sont', 'pour', 'dans', 'sur', 'par', 'pas', 'plus', 'que', 'qui', 'quoi', 'comment', 'pourquoi', 'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'ce', 'cet', 'cette', 'ces', 'mon', 'ton', 'son', 'mes', 'tes', 'ses', 'a', 'au', 'aux', 'en', 'si', 'ne', 'se']);
    return text
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\sàâçéèêëîïôûùüÿœæ]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 5);
  }, []);

  // Envoyer un message
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput('');
    setError(null);

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);

    // Message assistant vide qui sera streame
    const assistantMessage: Message = {
      id: `msg_${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      abortRef.current = new AbortController();

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          agentId: agent.id,
          conversationId,
          sessionId,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Streaming de la reponse
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + parsed.content,
                      metadata: parsed.metadata || last.metadata,
                    };
                  }
                  return updated;
                });
              }
            } catch {
              // Ignorer les lignes non-JSON
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages(prev => prev.slice(0, -1)); // Retirer le message vide
      } else {
        setError(err.message || 'Erreur lors de l\'envoi du message');
        setMessages(prev => prev.slice(0, -1));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }, [input, isStreaming, agent.id, conversationId, sessionId]);

  // Annuler le stream
  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Gestion des touches (Enter pour envoyer, Shift+Enter pour nouvelle ligne)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  // ============================================================
  // Render
  // ============================================================

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      maxWidth: '800px',
      margin: '0 auto',
      background: 'var(--background)',
      borderRadius: 'var(--radius)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: 'var(--card)',
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: 'var(--primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--primary-foreground)',
          fontWeight: 700,
          fontSize: '0.8rem',
        }}>
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{agent.name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
            {agent.model || 'Assistant IA'} {isStreaming && '· en train d\'écrire...'}
          </div>
        </div>
        {showAds && (
          <div style={{
            fontSize: '0.65rem',
            color: 'var(--muted-foreground)',
            background: 'var(--muted)',
            padding: '2px 8px',
            borderRadius: 'var(--radius)',
          }}>
            Plan Gratuit
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        {messages.length === 0 && !isStreaming && (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: 'var(--muted-foreground)',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🤖</div>
            <p style={{ fontSize: '0.9rem', margin: 0 }}>
              Commencez une conversation avec {agent.name}
            </p>
            <p style={{ fontSize: '0.8rem', margin: '4px 0 0', opacity: 0.7 }}>
              Posez une question ou donnez une instruction
            </p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div key={msg.id}>
            {/* Message */}
            <div style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: '4px',
            }}>
              <div style={{
                maxWidth: '75%',
                padding: '10px 14px',
                borderRadius: 'var(--radius)',
                background: msg.role === 'user' ? 'var(--primary)' : 'var(--card)',
                color: msg.role === 'user' ? 'var(--primary-foreground)' : 'var(--foreground)',
                border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                fontSize: '0.875rem',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.content || (isStreaming && index === messages.length - 1 ? (
                  <span style={{ opacity: 0.5 }}>...</span>
                ) : '')}
                {msg.metadata && msg.role === 'assistant' && msg.content && (
                  <div style={{
                    fontSize: '0.65rem',
                    color: 'var(--muted-foreground)',
                    marginTop: '6px',
                    opacity: 0.6,
                  }}>
                    {msg.metadata.model && `via ${msg.metadata.model}`}
                    {msg.metadata.tokens && ` · ${msg.metadata.tokens} tokens`}
                    {msg.metadata.durationMs && ` · ${Math.round(msg.metadata.durationMs / 1000)}s`}
                  </div>
                )}
              </div>
            </div>

            {/* Publicité conversationnelle (lien sponsorisé) — affichée après CHAQUE réponse de l'agent IA. */}
            {showAds && msg.role === 'assistant' && msg.content && (
              <ConversationAd
                userId={userId}
                sessionId={sessionId}
                conversationId={conversationId}
                keywords={extractKeywords(msg.content)}
              />
            )}
          </div>
        ))}

        {error && (
          <div style={{
            padding: '10px 14px',
            background: 'var(--destructive)',
            color: '#fff',
            borderRadius: 'var(--radius)',
            fontSize: '0.8rem',
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        background: 'var(--card)',
      }}>
        <div style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message à ${agent.name}...`}
            disabled={isStreaming}
            rows={1}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '0.875rem',
              resize: 'none',
              outline: 'none',
              minHeight: '40px',
              maxHeight: '120px',
              fontFamily: 'inherit',
            }}
          />
          {isStreaming ? (
            <button
              onClick={cancelStream}
              style={{
                padding: '10px 16px',
                borderRadius: 'var(--radius)',
                border: 'none',
                background: 'var(--destructive)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              ⏹ Stop
            </button>
          ) : (
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              style={{
                padding: '10px 20px',
                borderRadius: 'var(--radius)',
                border: 'none',
                background: input.trim() ? 'var(--primary)' : 'var(--muted)',
                color: input.trim() ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                cursor: input.trim() ? 'pointer' : 'not-allowed',
                fontSize: '0.8rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
            >
              Envoyer
            </button>
          )}
        </div>
        {showAds && (
          <div style={{
            fontSize: '0.65rem',
            color: 'var(--muted-foreground)',
            textAlign: 'center',
            marginTop: '6px',
            opacity: 0.6,
          }}>
            {plan === 'free'
              ? 'Plan gratuit : un lien sponsorisé est affiché après chaque réponse de l\'agent.'
              : 'Plan payant : un lien sponsorisé récompensé est affiché après chaque réponse. Désactivable dans les paramètres.'}
          </div>
        )}
      </div>
    </div>
  );
}
