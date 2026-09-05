import type { ContentBlock } from '@/types/blocks';
import { isTextBlock } from '@/types/blocks';
import { createId } from '@/utils/id';

export function createBlock(type: ContentBlock['type'], attachmentId?: string): ContentBlock {
  const id = createId('blk');
  switch (type) {
    case 'checklist':
      return { id, type, text: '', checked: false };
    case 'image':
      return { id, type, attachmentId: attachmentId ?? '' };
    case 'file':
      return { id, type, attachmentId: attachmentId ?? '' };
    default:
      return { id, type, text: '' };
  }
}

/** Flattens blocks to the plain text stored in `notes.content` (search/preview). */
export function blocksToPlainText(blocks: ContentBlock[]): string {
  return blocks
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Seeds a block model from a legacy plain-text note (Sprint 1–3 content). */
export function blocksFromPlainText(content: string): ContentBlock[] {
  if (content.trim().length === 0) {
    return [createBlock('paragraph')];
  }
  return [{ id: createId('blk'), type: 'paragraph', text: content }];
}

/**
 * Parses imported Markdown/plain text into blocks. Recognizes headings (`#`),
 * bullets (`-`/`*`), and task lists (`- [ ]` / `- [x]`); everything else becomes
 * a paragraph. Image/link syntax is kept as plain text (the referenced files
 * aren't available on import).
 */
export function markdownToBlocks(text: string): ContentBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ContentBlock[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    const id = createId('blk');
    const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      blocks.push({ id, type: 'checklist', text: task[2], checked: task[1].toLowerCase() === 'x' });
      continue;
    }
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push({ id, type: 'heading', text: heading[1] });
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      blocks.push({ id, type: 'bullet', text: bullet[1] });
      continue;
    }
    // Collapse runs of blank lines instead of emitting empty paragraphs.
    if (line.trim().length === 0) {
      if (blocks.length === 0 || blocks[blocks.length - 1].type !== 'paragraph') continue;
      const last = blocks[blocks.length - 1];
      if (last.type === 'paragraph' && last.text.length === 0) continue;
    }
    blocks.push({ id, type: 'paragraph', text: line.trim() });
  }
  return blocks.length > 0 ? blocks : [createBlock('paragraph')];
}

/** Parses stored blocks JSON, falling back to a plain-text seed. */
export function parseBlocks(blocksJson: string | null, content: string): ContentBlock[] {
  if (blocksJson) {
    try {
      const parsed = JSON.parse(blocksJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as ContentBlock[];
      }
    } catch {
      // Corrupt blocks — fall back to the plain content.
    }
  }
  return blocksFromPlainText(content);
}
