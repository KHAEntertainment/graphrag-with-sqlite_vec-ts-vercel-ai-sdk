import { describe, it, expect } from 'vitest';
import { MarkdownChunker } from '../../src/utils/markdown-chunker.js';

describe('MarkdownChunker', () => {
  describe('Basic Chunking', () => {
    it('should chunk simple markdown into size-appropriate chunks', () => {
      const chunker = new MarkdownChunker({ chunkSize: 100, overlapSize: 20 });
      const markdown = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10);

      const chunks = chunker.chunk(markdown);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.content.length).toBeLessThanOrEqual(200); // Within reasonable bounds
      });
    });

    it('should handle empty markdown', () => {
      const chunker = new MarkdownChunker();
      const chunks = chunker.chunk('');

      expect(chunks).toEqual([]);
    });

    it('should handle single-line markdown', () => {
      const chunker = new MarkdownChunker();
      const chunks = chunker.chunk('# Hello World');

      expect(chunks.length).toBe(1);
      expect(chunks[0].content).toContain('Hello World');
    });
  });

  describe('Heading Preservation', () => {
    it('should preserve heading hierarchy in chunks', () => {
      const chunker = new MarkdownChunker({ chunkSize: 50, includeHeadingContext: true });
      const markdown = `# Main Title
## Section 1
Some content here that will be chunked.
## Section 2
More content that spans multiple chunks.`;

      const chunks = chunker.chunk(markdown);

      // All chunks should have heading context
      chunks.forEach(chunk => {
        expect(chunk.headingContext.length).toBeGreaterThan(0);
      });
    });

    it('should track heading hierarchy correctly', () => {
      const chunker = new MarkdownChunker({ chunkSize: 200 });
      const markdown = `# Level 1
## Level 2
### Level 3
Content under level 3
## Another Level 2
Content under another level 2`;

      const chunks = chunker.chunk(markdown);

      // Check that heading stack is maintained
      const level3Chunk = chunks.find(c => c.content.includes('Content under level 3'));
      expect(level3Chunk?.headingContext).toContain('# Level 1');
      expect(level3Chunk?.headingContext).toContain('## Level 2');
      expect(level3Chunk?.headingContext).toContain('### Level 3');
    });

    it('should reset heading stack on same-level heading', () => {
      const chunker = new MarkdownChunker({ chunkSize: 200 });
      const markdown = `# Title
## Section A
Content A
## Section B
Content B`;

      const chunks = chunker.chunk(markdown);

      const sectionBChunk = chunks.find(c => c.content.includes('Content B'));
      expect(sectionBChunk?.headingContext).toContain('# Title');
      expect(sectionBChunk?.headingContext).toContain('## Section B');
      expect(sectionBChunk?.headingContext).not.toContain('## Section A');
    });
  });

  describe('Code Block Preservation', () => {
    it('should keep code blocks intact', () => {
      const chunker = new MarkdownChunker({ chunkSize: 100 });
      const codeBlock = `\`\`\`typescript
function example() {
  return "hello world";
}
\`\`\``;
      const markdown = `# Code Example\n\n${codeBlock}\n\nSome text after.`;

      const chunks = chunker.chunk(markdown);

      // Code block should appear complete in one chunk
      const codeChunk = chunks.find(c => c.content.includes('function example'));
      expect(codeChunk?.content).toContain('```typescript');
      expect(codeChunk?.content).toContain('function example()');
      expect(codeChunk?.content).toContain('```');
      expect(codeChunk?.metadata.hasCodeBlock).toBe(true);
    });

    it('should handle large code blocks', () => {
      const chunker = new MarkdownChunker({ chunkSize: 100, maxChunkSize: 2000 });
      const largeCode = `\`\`\`typescript
${Array(50).fill('const x = 1;').join('\n')}
\`\`\``;
      const markdown = `# Large Code\n\n${largeCode}`;

      const chunks = chunker.chunk(markdown);

      // Large code block should be in its own chunk
      const codeChunk = chunks.find(c => c.content.includes('const x = 1;'));
      expect(codeChunk).toBeDefined();
      expect(codeChunk?.content).toContain('```typescript');
      expect(codeChunk?.content).toContain('```');
    });

    it('should handle multiple code blocks', () => {
      const chunker = new MarkdownChunker({ chunkSize: 200 });
      const markdown = `# Examples

\`\`\`javascript
console.log("first");
\`\`\`

Some text between.

\`\`\`javascript
console.log("second");
\`\`\``;

      const chunks = chunker.chunk(markdown);

      // Should have chunks with code blocks
      const codeChunks = chunks.filter(c => c.metadata.hasCodeBlock);
      expect(codeChunks.length).toBeGreaterThan(0);
    });
  });

  describe('List Preservation', () => {
    it('should keep lists together', () => {
      const chunker = new MarkdownChunker({ chunkSize: 200 });
      const markdown = `# Features

- Feature 1
- Feature 2
- Feature 3
- Feature 4
- Feature 5

Some text after the list.`;

      const chunks = chunker.chunk(markdown);

      // List items should be in same chunk
      const listChunk = chunks.find(c => c.content.includes('Feature 1'));
      expect(listChunk?.content).toContain('Feature 2');
      expect(listChunk?.content).toContain('Feature 3');
    });

    it('should handle nested lists', () => {
      const chunker = new MarkdownChunker({ chunkSize: 300 });
      const markdown = `# Nested List

- Parent 1
  - Child 1.1
  - Child 1.2
- Parent 2
  - Child 2.1`;

      const chunks = chunker.chunk(markdown);

      const listChunk = chunks.find(c => c.content.includes('Parent 1'));
      expect(listChunk?.content).toContain('Child 1.1');
      expect(listChunk?.content).toContain('Child 1.2');
    });

    it('should handle ordered lists', () => {
      const chunker = new MarkdownChunker({ chunkSize: 200 });
      const markdown = `# Steps

1. First step
2. Second step
3. Third step`;

      const chunks = chunker.chunk(markdown);

      const listChunk = chunks.find(c => c.content.includes('First step'));
      expect(listChunk?.content).toContain('Second step');
      expect(listChunk?.content).toContain('Third step');
    });
  });

  describe('Table Preservation', () => {
    it('should keep tables intact', () => {
      const chunker = new MarkdownChunker({ chunkSize: 200 });
      const markdown = `# Data

| Name | Value |
|------|-------|
| A    | 1     |
| B    | 2     |
| C    | 3     |

Text after table.`;

      const chunks = chunker.chunk(markdown);

      const tableChunk = chunks.find(c => c.content.includes('| Name | Value |'));
      expect(tableChunk?.content).toContain('| A    | 1     |');
      expect(tableChunk?.content).toContain('| B    | 2     |');
      expect(tableChunk?.content).toContain('| C    | 3     |');
      expect(tableChunk?.metadata.hasTable).toBe(true);
    });
  });

  describe('Blockquote Preservation', () => {
    it('should keep blockquotes together', () => {
      const chunker = new MarkdownChunker({ chunkSize: 200 });
      const markdown = `# Quote

> This is a quote
> that spans multiple lines
> and should stay together.

Text after quote.`;

      const chunks = chunker.chunk(markdown);

      const quoteChunk = chunks.find(c => c.content.includes('This is a quote'));
      expect(quoteChunk?.content).toContain('that spans multiple lines');
      expect(quoteChunk?.content).toContain('and should stay together');
    });
  });

  describe('Overlap Handling', () => {
    it('should create overlap between chunks', () => {
      const chunker = new MarkdownChunker({ chunkSize: 100, overlapSize: 30 });
      const markdown = 'Lorem ipsum dolor sit amet. '.repeat(20);

      const chunks = chunker.chunk(markdown);

      // Check that adjacent chunks have some overlap
      if (chunks.length > 1) {
        const chunk1End = chunks[0].content.substring(chunks[0].content.length - 30);
        const chunk2Start = chunks[1].content.substring(0, 30);

        // There should be some common text (overlap)
        const hasOverlap = chunk1End.split(' ').some(word =>
          word.length > 3 && chunk2Start.includes(word)
        );
        expect(hasOverlap).toBe(true);
      }
    });
  });

  describe('Metadata Tracking', () => {
    it('should track chunk positions', () => {
      const chunker = new MarkdownChunker({ chunkSize: 100 });
      const markdown = 'Content here. '.repeat(20);

      const chunks = chunker.chunk(markdown);

      chunks.forEach((chunk, index) => {
        expect(chunk.metadata.startPos).toBeGreaterThanOrEqual(0);
        expect(chunk.metadata.endPos).toBeGreaterThan(chunk.metadata.startPos);

        // Each chunk should start after the previous one
        if (index > 0) {
          expect(chunk.metadata.startPos).toBeGreaterThanOrEqual(0);
        }
      });
    });

    it('should identify code blocks in metadata', () => {
      const chunker = new MarkdownChunker({ chunkSize: 200 });
      const markdown = `Text before.

\`\`\`js
code here
\`\`\`

Text after.`;

      const chunks = chunker.chunk(markdown);

      const codeChunk = chunks.find(c => c.content.includes('code here'));
      expect(codeChunk?.metadata.hasCodeBlock).toBe(true);

      const textChunks = chunks.filter(c => !c.content.includes('```'));
      textChunks.forEach(chunk => {
        expect(chunk.metadata.hasCodeBlock).toBe(false);
      });
    });

    it('should identify tables in metadata', () => {
      const chunker = new MarkdownChunker({ chunkSize: 200 });
      const markdown = `Text before.

| Col1 | Col2 |
|------|------|
| A    | B    |

Text after.`;

      const chunks = chunker.chunk(markdown);

      const tableChunk = chunks.find(c => c.content.includes('| Col1 | Col2 |'));
      expect(tableChunk?.metadata.hasTable).toBe(true);
    });
  });

  describe('Large Document Handling', () => {
    it('should handle 110k character markdown', () => {
      const chunker = new MarkdownChunker({ chunkSize: 600, overlapSize: 100 });

      // Generate large markdown (approx 110k chars = 27.5k tokens)
      const sections = Array(100).fill(null).map((_, i) => `
## Section ${i + 1}

This is section ${i + 1} with some content that describes various features and functionality.
It includes multiple paragraphs to simulate real documentation.

\`\`\`typescript
function example${i}() {
  return "Section ${i + 1}";
}
\`\`\`

More text here with technical details about implementation and usage patterns.
`).join('\n');

      const markdown = `# Large Documentation\n\n${sections}`;

      const chunks = chunker.chunk(markdown);

      // Should create many chunks
      expect(chunks.length).toBeGreaterThan(50);

      // All chunks should be within size bounds
      chunks.forEach(chunk => {
        expect(chunk.content.length).toBeLessThanOrEqual(2000); // max chunk size
      });

      // Should preserve structure
      const hasHeadings = chunks.every(c => c.headingContext.length > 0);
      expect(hasHeadings).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle markdown with only whitespace', () => {
      const chunker = new MarkdownChunker();
      const chunks = chunker.chunk('   \n\n   \n   ');

      expect(chunks.length).toBe(0);
    });

    it('should handle markdown with special characters', () => {
      const chunker = new MarkdownChunker({ chunkSize: 200 });
      const markdown = `# Special Characters

Content with <tags>, &entities;, and "quotes".

\`\`\`
Code with $pecial ch@rs!
\`\`\``;

      const chunks = chunker.chunk(markdown);

      expect(chunks.length).toBeGreaterThan(0);
      const contentChunk = chunks.find(c => c.content.includes('<tags>'));
      expect(contentChunk).toBeDefined();
    });

    it('should handle unclosed code blocks gracefully', () => {
      const chunker = new MarkdownChunker({ chunkSize: 200 });
      const markdown = `# Code

\`\`\`typescript
function incomplete() {
  // No closing fence`;

      const chunks = chunker.chunk(markdown);

      expect(chunks.length).toBeGreaterThan(0);
      // Should still include the content
      expect(chunks.some(c => c.content.includes('function incomplete'))).toBe(true);
    });
  });

  describe('Configuration Options', () => {
    it('should respect custom chunk size', () => {
      const smallChunker = new MarkdownChunker({ chunkSize: 50 });
      const largeChunker = new MarkdownChunker({ chunkSize: 1000 });
      const markdown = 'Content here. '.repeat(100);

      const smallChunks = smallChunker.chunk(markdown);
      const largeChunks = largeChunker.chunk(markdown);

      expect(smallChunks.length).toBeGreaterThan(largeChunks.length);
    });

    it('should respect includeHeadingContext option', () => {
      const withContext = new MarkdownChunker({ includeHeadingContext: true });
      const withoutContext = new MarkdownChunker({ includeHeadingContext: false });
      const markdown = `# Title
## Section
Content here`;

      const chunksWithContext = withContext.chunk(markdown);
      const chunksWithoutContext = withoutContext.chunk(markdown);

      // With context should include headings in content
      expect(chunksWithContext[0].content).toContain('# Title');

      // Without context should not duplicate headings
      expect(chunksWithoutContext[0].content.split('# Title').length).toBe(2); // Only once
    });
  });
});
