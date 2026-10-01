import type { ReactNode } from 'react';
import './globals.css';

// The localized root layout lives in [locale]/layout.tsx and renders <html>.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
