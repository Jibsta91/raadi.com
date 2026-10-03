// Small, non-secret preferences on the web build: localStorage, which can be unavailable (private
// windows, blocked storage), so every access is guarded.
export async function getPreference(key: string): Promise<string | null> {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setPreference(key: string, value: string): Promise<void> {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not persisted: the choice still applies for this visit.
  }
}
