import type { ContentBlock } from '@/types/blocks';
import { blocksFromPlainText, blocksToPlainText, createBlock, parseBlocks } from '@/utils/blocks';

describe('createBlock', () => {
  it('creates a checklist with checked=false', () => {
    const block = createBlock('checklist');
    expect(block.type).toBe('checklist');
    expect(block).toMatchObject({ text: '', checked: false });
  });
  it('attaches an attachment id to image blocks', () => {
    const block = createBlock('image', 'att_1');
    expect(block).toMatchObject({ type: 'image', attachmentId: 'att_1' });
  });
});

describe('blocksToPlainText', () => {
  it('joins text blocks and ignores media', () => {
    const blocks: ContentBlock[] = [
      { id: '1', type: 'heading', text: 'Title' },
      { id: '2', type: 'paragraph', text: 'Body' },
      { id: '3', type: 'checklist', text: 'Buy milk', checked: true },
      { id: '4', type: 'image', attachmentId: 'a' },
    ];
    expect(blocksToPlainText(blocks)).toBe('Title\nBody\nBuy milk');
  });
});

describe('blocksFromPlainText', () => {
  it('returns a single empty paragraph for empty input', () => {
    const blocks = blocksFromPlainText('');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
  });
  it('wraps content in one paragraph', () => {
    const blocks = blocksFromPlainText('hello\nworld');
    expect(blocks[0]).toMatchObject({ type: 'paragraph', text: 'hello\nworld' });
  });
});

describe('parseBlocks', () => {
  it('parses valid JSON blocks', () => {
    const json = JSON.stringify([{ id: '1', type: 'paragraph', text: 'hi' }]);
    expect(parseBlocks(json, 'hi')).toEqual([{ id: '1', type: 'paragraph', text: 'hi' }]);
  });
  it('falls back to plain text on corrupt JSON', () => {
    const blocks = parseBlocks('{not json', 'legacy note');
    expect(blocks[0]).toMatchObject({ type: 'paragraph', text: 'legacy note' });
  });
  it('falls back to plain text when blocks JSON is null', () => {
    const blocks = parseBlocks(null, 'legacy note');
    expect(blocks[0]).toMatchObject({ type: 'paragraph', text: 'legacy note' });
  });
});
