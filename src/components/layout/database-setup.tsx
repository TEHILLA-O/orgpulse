export function DatabaseSetup({ message }: { message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="max-w-lg rounded-3xl border border-white/15 bg-raised/70 p-8 text-white shadow-[0_20px_50px_rgba(0,0,0,0.4)] backdrop-blur-xl">
        <p className="text-[11px] font-semibold tracking-[0.28em] text-brand uppercase">Omni org chart</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Connect a Postgres database</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted-foreground)]">
          The Vercel build succeeded. The app still needs <code>DATABASE_URL</code> at runtime — that is why the
          dashboard showed a server error. Use a Supabase, Neon, or Vercel Postgres connection string (not the local
          Docker URL).
        </p>
        {message ? (
          <p className="mt-3 rounded-2xl bg-white/8 p-3 text-sm">{message}</p>
        ) : null}
        <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            In the Vercel project, add <code>DATABASE_URL</code>, <code>AUTH_SECRET</code>, and{' '}
            <code>ENCRYPTION_KEY</code>.
          </li>
          <li>
            Point <code>DATABASE_URL</code> at a hosted Postgres. Apply migrations with{' '}
            <code>npx prisma migrate deploy</code>.
          </li>
          <li>Seed Omni with <code>npx prisma db seed</code> if you want the demo organisation.</li>
        </ol>
      </div>
    </div>
  );
}
