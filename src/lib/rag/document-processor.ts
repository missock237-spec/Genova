// RAG Document Processor — PDF/text processing and chunking

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    source: string;
    fileName: string;
    pageNumber?: number;
    chunkIndex: number;
    totalChunks: number;
  };
}

export class DocumentProcessor {
  /**
   * Process an uploaded file (PDF, TXT, MD, CSV)
   */
  async processFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<DocumentChunk[]> {
    const text = await this.extractText(buffer, fileName, mimeType);
    const chunks = this.chunkText(text);

    return chunks.map((content, index) => ({
      id: `chunk_${Date.now()}_${index}`,
      content,
      metadata: {
        source: fileName,
        fileName,
        chunkIndex: index,
        totalChunks: chunks.length,
      },
    }));
  }

  /**
   * Split text into chunks with overlap for context preservation
   */
  chunkText(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
    if (!text || text.length === 0) return [];

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + chunkSize;

      // Try to break at a sentence boundary
      if (end < text.length) {
        const lastPeriod = text.lastIndexOf('.', end);
        const lastNewline = text.lastIndexOf('\n', end);
        const breakPoint = Math.max(lastPeriod, lastNewline);

        if (breakPoint > start + chunkSize * 0.5) {
          end = breakPoint + 1;
        }
      }

      const chunk = text.substring(start, end).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      start = end - overlap;
      if (start >= text.length) break;
    }

    return chunks;
  }

  /**
   * Extract text from PDF
   */
  async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      // pdf-parse is optional — type it inline to avoid missing module errors
      const pdfParse = (await import('pdf-parse' as string)) as unknown as (buf: Buffer) => Promise<{ text: string }>;
      const data = await pdfParse(buffer);
      return data.text || '';
    } catch {
      throw new Error('Impossible d\'extraire le texte du PDF. Le format pourrait ne pas être supporté.');
    }
  }

  /**
   * Extract text from various file formats
   */
  async extractText(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
    const ext = fileName.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'pdf':
        return this.extractPdfText(buffer);

      case 'txt':
      case 'md':
      case 'markdown':
        return buffer.toString('utf-8');

      case 'csv': {
        const content = buffer.toString('utf-8');
        // Simple CSV to text conversion
        return content;
      }

      case 'json':
        try {
          const data = JSON.parse(buffer.toString('utf-8'));
          return JSON.stringify(data, null, 2);
        } catch {
          return buffer.toString('utf-8');
        }

      default:
        // Try as plain text
        try {
          return buffer.toString('utf-8');
        } catch {
          throw new Error(`Format de fichier non supporté: ${ext}`);
        }
    }
  }
}
