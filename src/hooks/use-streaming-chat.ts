'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { parseSSEMessage, type SSEParsedEvent } from '@/lib/streaming';

// ============================================================
// TYPES
// ============================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  provider?: 'groq' | 'openrouter' | null;
  model?: string | null;
  isLoading?: boolean;
}

interface StreamEvent {
  type: string;
  data: Record<string, unknown>;
}

interface UseStreamingChatOptions {
  /** Auto-save conversation to database */
  autoSave?: boolean;
  /** Typing animation speed in ms per character */
  typingSpeed?: number;
  /** Maximum messages to keep in state */
  maxMessages?: number;
  /** Conversation ID to continue */
  conversationId?: string;
}

// ============================================================
// HOOK
// ============================================================

export function useStreamingChat(
  agentId: string,
  options: UseStreamingChatOptions = {}
) {
  const {
    autoSave = true,
    typingSpeed = 16,
    maxMessages = 100,
    conversationId: initialConversationId,
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [currentProvider, setCurrentProvider] = useState<'groq' | 'openrouter' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId || null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastMessageRef = useRef<string>('');
  const retryDataRef = useRef<{ message: string; conversationId?: string } | null>(null);

  /**
   * Parse a structured SSE event and extract data
   */
  const parseStreamEvent = useCallback((parsed: SSEParsedEvent): StreamEvent | null => {
    if (parsed.data === '[DONE]') {
      return { type: 'done', data: {} };
    }

    try {
      const parsedData = JSON.parse(parsed.data);
      return {
        type: parsed.event || parsedData.type || 'message',
        data: parsedData,
      };
    } catch {
      // If not JSON, treat as raw text data
      return {
        type: 'message',
        data: { text: parsed.data },
      };
    }
  }, []);

  /**
   * Detect provider from response headers or model name
   */
  const detectProvider = useCallback((response: Response): 'groq' | 'openrouter' | null => {
    // Check custom headers
    const streamVersion = response.headers.get('X-Stream-Version');
    if (streamVersion) {
      // Our backend sets provider info in some cases
    }

    // Check for Groq-specific headers
    const serverHeader = response.headers.get('x-groq') || response.headers.get('server');
    if (serverHeader?.toLowerCase().includes('groq')) return 'groq';

    // Check for OpenRouter-specific headers
    const orHeader = response.headers.get('x-openrouter');
    if (orHeader) return 'openrouter';

    return null;
  }, []);

  /**
   * Handle a stream event and update state accordingly
   */
  const handleStreamEvent = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case 'token': {
        const token = (event.data.token as string) || '';
        const model = event.data.model as string | undefined;

        // Detect provider from model name
        if (model) {
          if (model.includes('llama') || model.includes('deepseek-r1') || model.includes('qwq') || model.includes('qwen-qwq')) {
            setCurrentProvider('groq');
          } else {
            setCurrentProvider('openrouter');
          }
        }

        // Append token to streaming content
        setStreamingContent(prev => prev + token);
        break;
      }

      case 'metadata': {
        // Connection metadata received
        const connId = event.data.conversationId as string | undefined;
        if (connId) {
          setConversationId(prev => prev || connId);
        }
        break;
      }

      case 'complete': {
        const fullResponse = (event.data.fullResponse as string) || '';
        const convId = (event.data.conversationId as string) || '';
        const tokenCount = event.data.tokenCount as number | undefined;
        const duration = event.data.duration as number | undefined;

        // If we have a full response but streaming content is empty, use the full response
        if (fullResponse && !streamingContent) {
          setStreamingContent(fullResponse);
        }

        if (convId) {
          setConversationId(convId);
        }
        break;
      }

      case 'error': {
        const errorMessage = (event.data.error as string) || 'Erreur de streaming';
        setError(errorMessage);
        break;
      }

      case 'heartbeat': {
        // Heartbeat received, connection is alive
        break;
      }

      case 'batch': {
        // Handle batched events
        const events = event.data.events as Array<{ type: string; data: Record<string, unknown> }> | undefined;
        if (events && Array.isArray(events)) {
          for (const subEvent of events) {
            handleStreamEvent({ type: subEvent.type, data: subEvent.data });
          }
        }
        break;
      }

      case 'done': {
        // Stream is done
        break;
      }

      default: {
        // Handle raw SSE data from the AI provider
        // The chat route can also send raw OpenAI-format SSE chunks
        const delta = event.data as { choices?: Array<{ delta?: { content?: string } }> };
        if (delta?.choices?.[0]?.delta?.content) {
          const token = delta.choices[0].delta.content;
          setStreamingContent(prev => prev + token);
        }
        break;
      }
    }
  }, [streamingContent]);

  /**
   * Send a message and stream the response
   */
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    setError(null);
    lastMessageRef.current = text;
    retryDataRef.current = { message: text, conversationId: conversationId || undefined };

    // Add user message to state
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    // Add assistant placeholder
    const assistantPlaceholder: ChatMessage = {
      id: `assistant_${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isLoading: true,
    };

    setMessages(prev => {
      const updated = [...prev, userMessage, assistantPlaceholder];
      return updated.slice(-maxMessages);
    });

    setIsStreaming(true);
    setStreamingContent('');

    // Create AbortController for cancellation support
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          conversationId: conversationId || undefined,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erreur réseau' }));
        throw new Error(errorData.error || `Erreur HTTP ${response.status}`);
      }

      // Detect provider from headers
      const provider = detectProvider(response);
      if (provider) setCurrentProvider(provider);

      // Extract conversation ID from headers
      const responseConvId = response.headers.get('X-Conversation-Id');
      if (responseConvId) {
        setConversationId(responseConvId);
      }

      // Read the SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Pas de flux de réponse');

      const decoder = new TextDecoder();
      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const parsedEvents = parseSSEMessage(chunk);

        for (const parsed of parsedEvents) {
          const streamEvent = parseStreamEvent(parsed);
          if (!streamEvent) continue;

          if (streamEvent.type === 'done') {
            continue;
          }

          // Handle the event
          handleStreamEvent(streamEvent);

          // Accumulate token content
          if (streamEvent.type === 'token' && streamEvent.data.token) {
            accumulatedContent += streamEvent.data.token as string;
          } else if (streamEvent.type === 'batch' && streamEvent.data.events) {
            const events = streamEvent.data.events as Array<{ type: string; data: Record<string, unknown> }>;
            for (const evt of events) {
              if (evt.type === 'token' && evt.data.token) {
                accumulatedContent += evt.data.token as string;
              }
            }
          }
        }
      }

      // Finalize the assistant message with accumulated content
      setMessages(prev => {
        const updated = [...prev];
        const lastAssistantIdx = [...updated].reverse().findIndex(m => m.role === 'assistant' && m.isLoading);
        if (lastAssistantIdx !== -1) {
          const actualIdx = updated.length - 1 - lastAssistantIdx;
          updated[actualIdx] = {
            ...updated[actualIdx],
            content: accumulatedContent || streamingContent,
            isLoading: false,
            provider: currentProvider,
          };
        }
        return updated.slice(-maxMessages);
      });

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled the stream
        setMessages(prev => {
          const updated = [...prev];
          const lastAssistantIdx = [...updated].reverse().findIndex(m => m.role === 'assistant' && m.isLoading);
          if (lastAssistantIdx !== -1) {
            const actualIdx = updated.length - 1 - lastAssistantIdx;
            updated[actualIdx] = {
              ...updated[actualIdx],
              content: streamingContent || 'Réponse interrompue',
              isLoading: false,
            };
          }
          return updated;
        });
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
        setError(errorMessage);

        // Remove the placeholder and add error
        setMessages(prev => {
          const updated = prev.filter(m => !m.isLoading);
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      abortControllerRef.current = null;
    }
  }, [agentId, conversationId, isStreaming, maxMessages, streamingContent, currentProvider, detectProvider, parseStreamEvent, handleStreamEvent]);

  /**
   * Clear all messages
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingContent('');
    setError(null);
    setConversationId(null);
    setCurrentProvider(null);
  }, []);

  /**
   * Retry the last message
   */
  const retry = useCallback(() => {
    if (!retryDataRef.current) return;

    // Remove the last assistant message if it was an error
    setMessages(prev => {
      const updated = [...prev];
      // Remove last user message and any assistant placeholder
      while (updated.length > 0) {
        const last = updated[updated.length - 1];
        if (last.role === 'assistant' && (last.isLoading || !last.content)) {
          updated.pop();
        } else if (last.role === 'user' && last.content === retryDataRef.current?.message) {
          updated.pop();
          break;
        } else {
          break;
        }
      }
      return updated;
    });

    const { message, conversationId: retryConvId } = retryDataRef.current;
    retryDataRef.current = null;

    // Set conversation ID for retry
    if (retryConvId) {
      setConversationId(retryConvId);
    }

    // Send the message again
    setTimeout(() => sendMessage(message), 100);
  }, [sendMessage]);

  /**
   * Cancel the current stream
   */
  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    messages,
    sendMessage,
    isStreaming,
    streamingContent,
    currentProvider,
    error,
    conversationId,
    clearMessages,
    retry,
    cancelStream,
  };
}
