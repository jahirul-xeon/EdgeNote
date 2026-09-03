import { createId } from '@/utils/id';

describe('createId', () => {
  it('prefixes the id', () => {
    expect(createId('note')).toMatch(/^note_/);
    expect(createId('folder')).toMatch(/^folder_/);
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => createId('x')));
    expect(ids.size).toBe(1000);
  });
});
