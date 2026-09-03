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
