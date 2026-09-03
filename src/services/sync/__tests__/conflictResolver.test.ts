import { remoteWins } from '@/services/sync/conflictResolver';

describe('remoteWins (last-write-wins §12)', () => {
  const base = { updatedAt: 1000, syncVersion: 1, deviceId: 'aaa' };

  it('newer updatedAt wins', () => {
    expect(remoteWins(base, { ...base, updatedAt: 2000 })).toBe(true);
    expect(remoteWins({ ...base, updatedAt: 2000 }, base)).toBe(false);
  });

  it('breaks equal timestamps by higher syncVersion', () => {
    expect(remoteWins(base, { ...base, syncVersion: 2 })).toBe(true);
    expect(remoteWins({ ...base, syncVersion: 2 }, base)).toBe(false);
  });

  it('breaks full ties by deviceId, deterministically', () => {
    expect(remoteWins(base, { ...base, deviceId: 'zzz' })).toBe(true);
    expect(remoteWins({ ...base, deviceId: 'zzz' }, base)).toBe(false);
  });

  it('an exact tie does not let remote win (keeps local)', () => {
    expect(remoteWins(base, { ...base })).toBe(false);
  });
});
