/**
 * Structured note content (§16). A note body is an ordered list of blocks.
 * The flattened plain text is stored separately in `notes.content` for search
 * and previews; these blocks drive the editor.
 */
export type TextBlockType = 'paragraph' | 'heading' | 'bullet' | 'checklist';

export type ContentBlock =
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'heading'; text: string }
  | { id: string; type: 'bullet'; text: string }
  | { id: string; type: 'checklist'; text: string; checked: boolean }
  | { id: string; type: 'image'; attachmentId: string }
  | { id: string; type: 'file'; attachmentId: string }
  | {
      id: string;
      type: 'link';
      url: string;
      title?: string;
      description?: string;
      image?: string;
      siteName?: string;
    };

export type BlockType = ContentBlock['type'];

export const TEXT_BLOCK_TYPES: readonly BlockType[] = [
  'paragraph',
  'heading',
  'bullet',
  'checklist',
];

export function isTextBlock(
  block: ContentBlock,
): block is Extract<ContentBlock, { text: string }> {
  return TEXT_BLOCK_TYPES.includes(block.type);
}
