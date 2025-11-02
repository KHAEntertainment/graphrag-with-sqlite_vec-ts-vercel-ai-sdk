/**
 * Markdown-Aware Chunking Utility
 *
 * Provides intelligent chunking of markdown content that respects:
 * - Document structure (headers, sections)
 * - Code blocks (keep functions intact)
 * - Lists (preserve list context)
 * - Tables (keep tables together)
 * - Semantic boundaries
 *
 * Unlike naive character-based chunking, this preserves markdown semantics
 * and ensures chunks are meaningful and contextually complete.
 */

export interface ChunkOptions {
  /** Target chunk size in characters (flexible based on structure) */
  chunkSize?: number;
  /** Overlap between chunks for context continuity */
  overlapSize?: number;
  /** Maximum chunk size before forcing a split */
  maxChunkSize?: number;
  /** Include heading hierarchy in each chunk */
  includeHeadingContext?: boolean;
}

export interface MarkdownChunk {
  /** Chunk content */
  content: string;
  /** Heading hierarchy for context (e.g., ["# Title", "## Section"]) */
  headingContext: string[];
  /** Chunk metadata */
  metadata: {
    /** Starting character position in original markdown */
    startPos: number;
    /** Ending character position in original markdown */
    endPos: number;
    /** Primary heading for this chunk */
    primaryHeading?: string;
    /** Whether chunk contains code blocks */
    hasCodeBlock: boolean;
    /** Whether chunk contains tables */
    hasTable: boolean;
  };
}

/**
 * Intelligently chunk markdown content while respecting structure
 */
export class MarkdownChunker {
  private readonly chunkSize: number;
  private readonly overlapSize: number;
  private readonly maxChunkSize: number;
  private readonly includeHeadingContext: boolean;

  constructor(options: ChunkOptions = {}) {
    this.chunkSize = options.chunkSize ?? 600;
    this.overlapSize = options.overlapSize ?? 100;
    this.maxChunkSize = options.maxChunkSize ?? 2000;
    this.includeHeadingContext = options.includeHeadingContext ?? true;
  }

  /**
   * Split markdown into intelligent chunks
   */
  chunk(markdown: string): MarkdownChunk[] {
    // Parse markdown into blocks
    const blocks = this.parseBlocks(markdown);

    // Group blocks into chunks
    const chunks: MarkdownChunk[] = [];
    let currentChunk: typeof blocks = [];
    let currentSize = 0;
    let headingStack: string[] = [];
    let chunkHeadingContext: string[] = []; // Track heading context for current chunk
    let position = 0;

    for (const block of blocks) {
      const blockSize = block.content.length;

      // Update heading stack for context BEFORE checking split
      if (block.type === 'heading') {
        const level = this.getHeadingLevel(block.content);
        headingStack = headingStack.filter(h => this.getHeadingLevel(h) < level);
        headingStack.push(block.content);
      }

      // Check if we should split before adding this block
      // Split if: 
      // 1. Current chunk is at/over target size, OR
      // 2. Adding this block would exceed max size, OR
      // 3. Current chunk has content AND adding this block would exceed target size
      const shouldSplit = 
        currentChunk.length > 0 && (
          currentSize >= this.chunkSize ||
          currentSize + blockSize > this.maxChunkSize ||
          (currentSize > 0 && currentSize + blockSize > this.chunkSize)
        );

      if (shouldSplit) {
        // Don't split if current block is special (code, table) and we're within limits
        const isSpecialBlock = block.type === 'code' || block.type === 'table';
        const wouldExceedMax = currentSize + blockSize > this.maxChunkSize;
        const needsSplit = currentSize >= this.chunkSize || wouldExceedMax;
        
        if (needsSplit || !isSpecialBlock) {
          // Create chunk from current blocks with the heading context captured when chunk started
          chunks.push(this.createChunk(currentChunk, chunkHeadingContext, position));

          // Start new chunk with overlap
          const overlapBlocks = this.getOverlapBlocks(currentChunk);
          currentChunk = overlapBlocks;
          currentSize = overlapBlocks.reduce((sum, b) => sum + b.content.length, 0);
          position += currentChunk.length > 0 ? currentChunk[0].startPos : 0;
          
          // Capture heading context for new chunk (includes current heading if this is a heading block)
          chunkHeadingContext = [...headingStack];
        }
      }

      // If this is the first block in a new chunk, capture current heading context
      if (currentChunk.length === 0) {
        chunkHeadingContext = [...headingStack];
      }

      // Add block to current chunk
      currentChunk.push({ ...block, startPos: position });
      currentSize += blockSize;
      position += blockSize;
    }

    // Add final chunk if there's content
    if (currentChunk.length > 0) {
      chunks.push(this.createChunk(currentChunk, chunkHeadingContext, position));
    }

    return chunks;
  }

  /**
   * Parse markdown into structural blocks
   */
  private parseBlocks(markdown: string): Array<{
    type: 'heading' | 'paragraph' | 'code' | 'list' | 'table' | 'blockquote';
    content: string;
    startPos: number;
  }> {
    const blocks: Array<{ type: any; content: string; startPos: number }> = [];
    const lines = markdown.split('\n');

    let i = 0;
    let position = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Code block (fenced)
      if (line.trim().startsWith('```')) {
        const codeBlock = this.extractCodeBlock(lines, i);
        blocks.push({
          type: 'code',
          content: codeBlock.content,
          startPos: position
        });
        position += codeBlock.content.length;
        i = codeBlock.endIndex;
        continue;
      }

      // Heading
      if (line.match(/^#{1,6}\s/)) {
        blocks.push({
          type: 'heading',
          content: line,
          startPos: position
        });
        position += line.length + 1; // +1 for newline
        i++;
        continue;
      }

      // Table (starts with |)
      if (line.trim().startsWith('|')) {
        const table = this.extractTable(lines, i);
        blocks.push({
          type: 'table',
          content: table.content,
          startPos: position
        });
        position += table.content.length;
        i = table.endIndex;
        continue;
      }

      // List (ordered or unordered)
      if (line.match(/^(\s*)(-|\*|\+|\d+\.)\s/)) {
        const list = this.extractList(lines, i);
        blocks.push({
          type: 'list',
          content: list.content,
          startPos: position
        });
        position += list.content.length;
        i = list.endIndex;
        continue;
      }

      // Blockquote
      if (line.trim().startsWith('>')) {
        const blockquote = this.extractBlockquote(lines, i);
        blocks.push({
          type: 'blockquote',
          content: blockquote.content,
          startPos: position
        });
        position += blockquote.content.length;
        i = blockquote.endIndex;
        continue;
      }

      // Regular paragraph
      const paragraph = this.extractParagraph(lines, i);
      if (paragraph.content.trim().length > 0) {
        blocks.push({
          type: 'paragraph',
          content: paragraph.content,
          startPos: position
        });
      }
      position += paragraph.content.length;
      i = paragraph.endIndex;
    }

    return blocks;
  }

  /**
   * Extract code block (everything between ``` fences)
   */
  private extractCodeBlock(lines: string[], startIndex: number): { content: string; endIndex: number } {
    const result: string[] = [lines[startIndex]]; // Include opening fence
    let i = startIndex + 1;

    while (i < lines.length) {
      result.push(lines[i]);
      if (lines[i].trim().startsWith('```')) {
        break; // Found closing fence
      }
      i++;
    }

    return {
      content: result.join('\n') + '\n',
      endIndex: i + 1
    };
  }

  /**
   * Extract table (contiguous lines starting with |)
   */
  private extractTable(lines: string[], startIndex: number): { content: string; endIndex: number } {
    const result: string[] = [];
    let i = startIndex;

    while (i < lines.length && lines[i].trim().startsWith('|')) {
      result.push(lines[i]);
      i++;
    }

    return {
      content: result.join('\n') + '\n',
      endIndex: i
    };
  }

  /**
   * Extract list (contiguous list items with same or deeper indentation)
   */
  private extractList(lines: string[], startIndex: number): { content: string; endIndex: number } {
    const result: string[] = [lines[startIndex]];
    const baseIndent = lines[startIndex].match(/^(\s*)/)?.[1].length ?? 0;
    let i = startIndex + 1;

    while (i < lines.length) {
      const line = lines[i];
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;

      // Check if it's a list item or continuation
      const isListItem = line.match(/^(\s*)(-|\*|\+|\d+\.)\s/);
      const isContinuation = indent > baseIndent && line.trim().length > 0;
      const isBlankLine = line.trim().length === 0;

      if (!isListItem && !isContinuation && !isBlankLine) {
        break; // End of list
      }

      result.push(line);
      i++;
    }

    return {
      content: result.join('\n') + '\n',
      endIndex: i
    };
  }

  /**
   * Extract blockquote (contiguous lines starting with >)
   */
  private extractBlockquote(lines: string[], startIndex: number): { content: string; endIndex: number } {
    const result: string[] = [];
    let i = startIndex;

    while (i < lines.length && (lines[i].trim().startsWith('>') || lines[i].trim().length === 0)) {
      result.push(lines[i]);
      if (lines[i].trim().length === 0 && i + 1 < lines.length && !lines[i + 1].trim().startsWith('>')) {
        break; // End of blockquote
      }
      i++;
    }

    return {
      content: result.join('\n') + '\n',
      endIndex: i
    };
  }

  /**
   * Extract paragraph (until empty line or special block)
   */
  private extractParagraph(lines: string[], startIndex: number): { content: string; endIndex: number } {
    const result: string[] = [];
    let i = startIndex;

    while (i < lines.length) {
      const line = lines[i];

      // Stop at empty line
      if (line.trim().length === 0) {
        result.push(line);
        i++;
        break;
      }

      // Stop at special blocks
      if (line.match(/^#{1,6}\s/) || line.trim().startsWith('```') ||
          line.trim().startsWith('|') || line.match(/^(\s*)(-|\*|\+|\d+\.)\s/) ||
          line.trim().startsWith('>')) {
        break;
      }

      result.push(line);
      i++;
    }

    return {
      content: result.join('\n') + '\n',
      endIndex: i
    };
  }

  /**
   * Get heading level (1-6)
   */
  private getHeadingLevel(heading: string): number {
    const match = heading.match(/^(#{1,6})\s/);
    return match ? match[1].length : 0;
  }

  /**
   * Get blocks for overlap (last N chars worth of blocks)
   */
  private getOverlapBlocks(blocks: Array<{ content: string; startPos: number }>): typeof blocks {
    let size = 0;
    const overlap: typeof blocks = [];

    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      if (size + block.content.length > this.overlapSize) {
        break;
      }
      overlap.unshift(block);
      size += block.content.length;
    }

    return overlap;
  }

  /**
   * Create chunk from blocks
   */
  private createChunk(
    blocks: Array<{ type: string; content: string; startPos: number }>,
    headingContext: string[],
    position: number
  ): MarkdownChunk {
    const content = blocks.map(b => b.content).join('');
    const hasCodeBlock = blocks.some(b => b.type === 'code');
    const hasTable = blocks.some(b => b.type === 'table');
    const primaryHeading = headingContext[headingContext.length - 1];

    // Optionally prepend heading context
    const finalContent = this.includeHeadingContext && headingContext.length > 0
      ? `${headingContext.join('\n')}\n\n${content}`
      : content;

    return {
      content: finalContent.trim(),
      headingContext: [...headingContext],
      metadata: {
        startPos: blocks[0]?.startPos ?? position,
        endPos: (blocks[blocks.length - 1]?.startPos ?? position) +
                (blocks[blocks.length - 1]?.content.length ?? 0),
        primaryHeading,
        hasCodeBlock,
        hasTable
      }
    };
  }
}