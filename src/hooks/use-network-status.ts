import { useEffect, useState } from 'react';

import { getNetworkState, subscribeToNetwork, type NetworkState } from '@/services/network/networkMonitor';

/** Reactive connectivity state for the offline indicator. */
export function useNetworkStatus(): NetworkState {
  const [state, setState] = useState<NetworkState>(getNetworkState());
  useEffect(() => subscribeToNetwork(setState), []);
  return state;
}
