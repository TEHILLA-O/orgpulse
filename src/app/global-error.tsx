'use client';

// Renders its own document, so globals.css is not loaded here: colours must be literal.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const minified = error.message.includes('Minified React error');
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#0a0d13', color: '#e7ebf3', margin: 0 }}>
        <div style={{ maxWidth: 560, margin: '20vh auto', padding: 24 }}>
          <p style={{ letterSpacing: '0.08em', fontSize: 13, color: '#4c8dff' }}>Omni org chart</p>
          <h1 style={{ fontSize: 28, margin: '12px 0' }}>The app could not start</h1>
          <p style={{ color: '#a2adc1', lineHeight: 1.5 }}>
            {minified
              ? 'The server could not render this page. In Vercel, add DATABASE_URL, AUTH_SECRET, and ENCRYPTION_KEY, then redeploy.'
              : error.message}
          </p>
        </div>
      </body>
    </html>
  );
}
