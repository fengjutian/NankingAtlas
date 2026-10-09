export default function Loading() {
  return (
    <main className="shell" aria-busy="true" aria-live="polite">
      <p style={{ color: 'var(--color-muted)' }}>加载中…</p>
    </main>
  );
}