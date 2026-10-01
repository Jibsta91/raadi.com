import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Locale negotiation (Accept-Language / cookie) and prefix redirects.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, the BFF's /auth/*, Next internals and static files.
  matcher: ['/((?!api|auth|_next|_vercel|.*\\..*).*)'],
};
