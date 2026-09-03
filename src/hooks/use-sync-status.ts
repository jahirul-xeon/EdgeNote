import { useEffect, useState } from 'react';

import { getSyncState, subscribeToSyncState, type SyncState } from '@/services/sync/syncStatus';

export function useSyncStatus(): SyncState {
  const [state, setState] = useState<SyncState>(getSyncState());
  useEffect(() => subscribeToSyncState(setState), []);
  return state;
}
