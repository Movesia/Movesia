import '@/app/styles/globals.css';

import { createRoot } from 'react-dom/client';

// ── Global error handlers ────────────────────────────────────────────────
// Catch unhandled errors and promise rejections that escape React's boundary.

window.onerror = (message, source, lineno, colno, error) => {
  console.error('[Global] Uncaught error:', { message, source, lineno, colno, error });
  showFatalError(`${message}`, error?.stack || `${source}:${lineno}:${colno}`);
};

window.onunhandledrejection = (event) => {
  console.error('[Global] Unhandled promise rejection:', event.reason);
  showFatalError(
    event.reason?.message || 'Unhandled promise rejection',
    event.reason?.stack || String(event.reason)
  );
};

/**
 * Shows a fatal error directly in the DOM when React can't render at all.
 * Uses inline styles so it works even if CSS fails to load.
 */
function showFatalError(message: string, stack?: string) {
  const root = document.getElementById('root');
  if (!root) return;
  // Only show if the root is empty (React didn't render anything)
  if (root.children.length > 0 && root.innerHTML.trim() !== '') return;

  root.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:2rem;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0f0f0f;color:#e4e4e7;">
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem;">
        <div style="width:2.5rem;height:2.5rem;border-radius:50%;background:#dc2626;display:flex;align-items:center;justify-content:center;font-size:1.25rem;font-weight:bold;color:white;">!</div>
        <h1 style="font-size:1.5rem;font-weight:700;margin:0;color:#fafafa;">Fatal Error — React Failed to Mount</h1>
      </div>
      <p style="font-size:0.9rem;color:#a1a1aa;margin-bottom:1.5rem;max-width:600px;text-align:center;line-height:1.5;">
        The application failed to start. This usually means a module import failed or a component threw during initialization.
      </p>
      <pre style="background:#1a1a1e;border:1px solid #27272a;border-radius:0.75rem;padding:1.25rem;max-width:720px;width:100%;overflow:auto;font-size:0.8rem;line-height:1.6;color:#f87171;white-space:pre-wrap;word-break:break-word;max-height:300px;margin:0 0 1.5rem 0;">
<strong style="color:#fca5a5;">Error: </strong>${escapeHtml(message)}

<span style="color:#71717a;font-size:0.75rem;">${escapeHtml(stack || '')}</span></pre>
      <button onclick="window.location.reload()" style="padding:0.625rem 1.5rem;background:#fafafa;color:#0f0f0f;border:none;border-radius:0.5rem;font-size:0.875rem;font-weight:600;cursor:pointer;">Reload App</button>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Render ───────────────────────────────────────────────────────────────

async function bootstrap() {
  try {
    // Dynamic import so module-level errors are caught
    const [{ default: App }, { ErrorBoundary }] = await Promise.all([
      import('@/app/App'),
      import('@/app/components/error-boundary'),
    ]);

    const container = document.getElementById('root') as HTMLDivElement;
    const root = createRoot(container);

    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[Bootstrap] Failed to start app:', error);
    showFatalError(error.message, error.stack);
  }
}

bootstrap();
