import { createContext, use } from 'react';
import type { Auth } from './types';

export const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const auth = use(AuthContext);
  if (!auth) throw new Error('useAuth outside AuthProvider');
  return auth;
}
