export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
}

export interface Auth {
  status: 'loading' | 'signedIn' | 'signedOut';
  user: AuthUser | null;
  /** Set when the last sign-in attempt failed. */
  error: boolean;
  signIn: (returnTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** fetch for API calls: a bearer token on native, the website's session cookie on the web. */
  fetch: (request: Request) => Promise<Response>;
  /** Extra headers for the messaging WebSocket handshake (native only). */
  socketHeaders: () => Promise<Record<string, string> | undefined>;
  /**
   * Registers work to run when the user signs out, while the session still works (removing this
   * device's push token). Returns an unsubscribe function. Each task gets a few seconds at most.
   */
  beforeSignOut: (task: () => Promise<void>) => () => void;
}
