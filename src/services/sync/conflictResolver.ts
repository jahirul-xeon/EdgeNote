/**
 * Conflict resolution (§12). Last-write-wins by updatedAt, then higher
 * syncVersion, then deviceId as a stable final tiebreaker so both devices
 * independently agree on the same winner.
 */
type Comparable = { updatedAt: number; syncVersion: number; deviceId: string };

export function remoteWins(local: Comparable, remote: Comparable): boolean {
  if (remote.updatedAt !== local.updatedAt) {
    return remote.updatedAt > local.updatedAt;
  }
  if (remote.syncVersion !== local.syncVersion) {
    return remote.syncVersion > local.syncVersion;
  }
  return remote.deviceId > local.deviceId;
}
