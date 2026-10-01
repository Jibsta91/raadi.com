// Fallback for paths outside any locale (the proxy normally adds one).
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem', textAlign: 'center' }}>
        <h1>404 — Page not found</h1>
        <p>
          <a href="/">Go to Raadi</a>
        </p>
      </body>
    </html>
  );
}
