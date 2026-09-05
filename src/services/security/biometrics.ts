/**
 * Device authentication for locked notes (§65 V2). Wraps
 * expo-local-authentication: Face ID / Touch ID / fingerprint, falling back to
 * the device passcode. If the device has no secured auth at all, we treat the
 * gate as open rather than locking the user out of their own notes.
 */
import * as LocalAuthentication from 'expo-local-authentication';

/** True if the device can authenticate the user (biometrics or passcode). */
export async function isDeviceAuthAvailable(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

/**
 * Prompts the user to authenticate. Returns true on success. If no device auth
 * is configured, returns true (we can't gate on something the device lacks).
 */
export async function authenticate(promptMessage: string): Promise<boolean> {
  try {
    if (!(await isDeviceAuthAvailable())) return true;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
