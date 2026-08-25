'use client';

import { useState, useCallback, type ReactNode, memo } from 'react';
import {
  Bot,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

export interface AgentResponseProps {
  /** The raw content string (may contain markdown-like syntax) */
  content: string;
  /** Agent display name */
  agentName?: string;
  /** Agent avatar URL or undefined for default icon */
  avatar?: string | null;
  /** Timestamp string (ISO or locale) */
  timestamp?: string;
  /** Whether the response is still streaming */
  isStreaming?: boolean;
  /** Additional CSS class names */
  className?: string;
}

// ============================================================
// Lightweight Markdown Parser
// ============================================================
// Parses common markdown patterns into React elements without
// external dependencies. Handles: headings, bold, italic,
// inline code, code blocks (with language), unordered/ordered
// lists, blockquotes, horizontal rules, and links.

interface Token {
  type:
    | 'heading'
    | 'code-block'
    | 'paragraph'
    | 'list'
    | 'blockquote'
    | 'hr'
    | 'empty';
  raw: string;
  meta?: string; // language for code blocks, level for headings
  children?: string;
}

/**
 * Tokenize raw markdown text into structured blocks.
 */
function tokenize(input: string): Token[] {
  const lines = input.split('\n');
  const tokens: Token[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // --- Code block (fenced) ---
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim() || '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      // skip closing fence
      if (i < lines.length) i++;
      tokens.push({
        type: 'code-block',
        raw: codeLines.join('\n'),
        meta: lang,
        children: codeLines.join('\n'),
      });
      continue;
    }

    // --- Heading ---
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      tokens.push({
        type: 'heading',
        raw: line,
        meta: headingMatch[1].length.toString(),
        children: headingMatch[2],
      });
      i++;
      continue;
    }

    // --- Horizontal rule ---
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      tokens.push({ type: 'hr', raw: line });
      i++;
      continue;
    }

    // --- Blockquote ---
    if (line.trimStart().startsWith('>')) {
      const bqLines: string[] = [];
      while (
        i < lines.length &&
        (lines[i].trimStart().startsWith('>') || (lines[i].trim() !== '' && bqLines.length > 0))
      ) {
        bqLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      tokens.push({
        type: 'blockquote',
        raw: bqLines.join('\n'),
        children: bqLines.join('\n'),
      });
      continue;
    }

    // --- Unordered list ---
    if (/^\s*[-*+]\s/.test(line)) {
      const listLines: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s/.test(lines[i])) {
        listLines.push(lines[i].replace(/^\s*[-*+]\s/, ''));
        i++;
      }
      tokens.push({
        type: 'list',
        raw: listLines.join('\n'),
        meta: 'ul',
        children: listLines.join('\n'),
      });
      continue;
    }

    // --- Ordered list ---
    if (/^\s*\d+\.\s/.test(line)) {
      const listLines: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        listLines.push(lines[i].replace(/^\s*\d+\.\s/, ''));
        i++;
      }
      tokens.push({
        type: 'list',
        raw: listLines.join('\n'),
        meta: 'ol',
        children: listLines.join('\n'),
      });
      continue;
    }

    // --- Empty line ---
    if (line.trim() === '') {
      // Merge consecutive empty lines
      if (tokens.length > 0 && tokens[tokens.length - 1].type === 'empty') {
        i++;
        continue;
      }
      tokens.push({ type: 'empty', raw: '' });
      i++;
      continue;
    }

    // --- Paragraph: collect consecutive non-empty, non-special lines ---
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].match(/^(#{1,6})\s+/) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i].trim()) &&
      !lines[i].trimStart().startsWith('>') &&
      !/^\s*[-*+]\s/.test(lines[i]) &&
      !/^\s*\d+\.\s/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      tokens.push({
        type: 'paragraph',
        raw: paraLines.join('\n'),
        children: paraLines.join(' '),
      });
    }
  }

  return tokens;
}

// ============================================================
// Inline formatting renderer
// ============================================================

/**
 * Renders inline markdown: **bold**, *italic*, `code`, [link](url)
 * Uses a simple state-machine approach to avoid regex collisions.
 */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // --- Inline code `...` ---
    const codeMatch = remaining.match(/^(.*?)(`([^`]+)`)(.*)/s);
    if (codeMatch) {
      if (codeMatch[1]) {
        nodes.push(renderInlineFormatting(codeMatch[1], keyIdx++));
      }
      nodes.push(
        <code
          key={`c-${keyIdx++}`}
          className="agent-inline-code"
        >
          {codeMatch[3]}
        </code>,
      );
      remaining = codeMatch[4];
      continue;
    }

    // No more special patterns
    nodes.push(renderInlineFormatting(remaining, keyIdx++));
    break;
  }

  return nodes;
}

/**
 * Renders bold and italic within plain text segments.
 */
function renderInlineFormatting(text: string, key: number): ReactNode {
  // Process bold first (**...**), then italic (*...*), then links
  const parts: ReactNode[] = [];
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partKey = key * 100;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderItalicAndLinks(text.slice(lastIndex, match.index), partKey++));
    }
    parts.push(
      <strong key={`b-${partKey++}`} className="font-semibold text-foreground">
        {match[1]}
      </strong>,
    );
    lastIndex = boldRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(...renderItalicAndLinks(text.slice(lastIndex), partKey++));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/**
 * Renders italic (*...*) and [link](url) patterns.
 */
function renderItalicAndLinks(text: string, key: number): ReactNode[] {
  const parts: ReactNode[] = [];
  const italicRegex = /\*([^*]+?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partKey = key * 100;

  while ((match = italicRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderLinks(text.slice(lastIndex, match.index), partKey++));
    }
    parts.push(
      <em key={`i-${partKey++}`} className="italic text-foreground/90">
        {match[1]}
      </em>,
    );
    lastIndex = italicRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(...renderLinks(text.slice(lastIndex), partKey++));
  }

  return parts;
}

/**
 * Renders [text](url) markdown links.
 */
function renderLinks(text: string, key: number): ReactNode[] {
  const parts: ReactNode[] = [];
  const linkRegex = /\[([^\]]+)]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partKey = key * 100;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t-${partKey++}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <a
        key={`a-${partKey++}`}
        href={match[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#00F5FF] hover:underline underline-offset-2 transition-colors"
      >
        {match[1]}
      </a>,
    );
    lastIndex = linkRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={`t-${partKey++}`}>{text.slice(lastIndex)}</span>);
  }

  return parts;
}

// ============================================================
// Code Block Sub-component
// ============================================================

interface CodeBlockProps {
  code: string;
  language?: string;
}

const CodeBlock = memo(function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="agent-code-block-wrapper my-3 group">
      {/* Header bar */}
      <div className="agent-code-block-header">
        <span className="agent-code-block-lang">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="agent-code-copy-btn"
          aria-label={copied ? 'Copié' : 'Copier le code'}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>Copié</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copier</span>
            </>
          )}
        </button>
      </div>
      {/* Code content */}
      <div className="agent-code-block-content">
        <pre className="agent-code-block-pre">
          <code className="agent-code-block-code">{code}</code>
        </pre>
      </div>
    </div>
  );
});

// ============================================================
// Token Renderer
// ============================================================

function renderToken(token: Token, index: number): ReactNode {
  switch (token.type) {
    case 'heading': {
      const level = parseInt(token.meta || '3', 10);
      const sizeClasses: Record<number, string> = {
        1: 'text-lg font-bold mt-4 mb-2',
        2: 'text-base font-bold mt-3 mb-1.5',
        3: 'text-sm font-semibold mt-3 mb-1',
        4: 'text-sm font-semibold mt-2 mb-1',
        5: 'text-xs font-semibold mt-2 mb-0.5',
        6: 'text-xs font-semibold mt-2 mb-0.5',
      };
      const Tag = (`h${Math.min(Math.max(level, 1), 6)}`) as keyof JSX.IntrinsicElements;
      const cls = sizeClasses[level] || sizeClasses[3];
      return (
        <Tag key={index} className={cn(cls, 'text-foreground first:mt-0')}>
          {token.children ? renderInline(token.children) : token.raw}
        </Tag>
      );
    }

    case 'code-block':
      return (
        <CodeBlock
          key={index}
          code={token.children || token.raw}
          language={token.meta}
        />
      );

    case 'list': {
      const isOrdered = token.meta === 'ol';
      const items = (token.children || token.raw).split('\n').filter(Boolean);
      const Tag = isOrdered ? 'ol' : 'ul';
      return (
        <Tag
          key={index}
          className={cn(
            'my-2 space-y-1',
            isOrdered ? 'agent-ordered-list' : 'agent-unordered-list',
          )}
        >
          {items.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed text-foreground/85">
              {renderInline(item)}
            </li>
          ))}
        </Tag>
      );
    }

    case 'blockquote':
      return (
        <blockquote
          key={index}
          className="agent-blockquote my-3"
        >
          <p className="text-sm italic text-foreground/70 leading-relaxed">
            {token.children ? renderInline(token.children) : token.raw}
          </p>
        </blockquote>
      );

    case 'hr':
      return (
        <hr
          key={index}
          className="my-4 border-border/40"
        />
      );

    case 'paragraph':
      return (
        <p key={index} className="text-sm leading-relaxed text-foreground/90 my-1.5">
          {token.children ? renderInline(token.children) : token.raw}
        </p>
      );

    case 'empty':
      return <div key={index} className="h-2" />;

    default:
      return null;
  }
}

// ============================================================
// Main AgentResponse Component
// ============================================================

export const AgentResponse = memo(function AgentResponse({
  content,
  agentName,
  avatar,
  timestamp,
  isStreaming = false,
  className,
}: AgentResponseProps) {
  // If there's no content and not streaming, render nothing
  if (!content && !isStreaming) return null;

  const tokens = tokenize(content || '');

  const formattedTime = timestamp
    ? new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className={cn('agent-response-container', isStreaming ? 'chat-msg-agent-enter' : '', className)}>
      {/* Agent identity header */}
      <div className="agent-response-header">
        <div className="agent-response-avatar">
          {avatar ? (
            <img
              src={avatar}
              alt={agentName || 'Agent'}
              className="h-5 w-5 rounded-full object-cover"
            />
          ) : (
            <Bot className="h-5 w-5 text-[#00F5FF]" />
          )}
        </div>
        <div className="agent-response-meta">
          <span className="agent-response-name">
            {agentName || 'Agent IA'}
          </span>
          {isStreaming && (
            <span className="agent-response-streaming-badge">
              <Sparkles className="h-3 w-3" />
              Génération en cours
            </span>
          )}
        </div>
        {formattedTime && !isStreaming && (
          <span className="agent-response-time">{formattedTime}</span>
        )}
      </div>

      {/* Content body */}
      <div className="agent-response-body">
        {tokens.map((token, idx) => renderToken(token, idx))}
        {/* Streaming cursor */}
        {isStreaming && content && (
          <span className="hardtech-caret" />
        )}
      </div>
    </div>
  );
});

export default AgentResponse;
