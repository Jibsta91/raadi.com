import { Redirect } from 'expo-router';

// Keycloak redirects to raadi://auth (exp://…/--/auth in Expo Go). The auth session in
// expo-auth-session consumes that redirect; if the router sees it anyway, go home.
export default function AuthRedirect() {
  return <Redirect href="/" />;
}
