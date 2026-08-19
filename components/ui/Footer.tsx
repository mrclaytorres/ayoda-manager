/**
 * A plain <a>, not next/link: this leaves the app entirely, so client-side routing has nothing to
 * do. rel="noopener" is what stops the opened tab from reaching back through window.opener.
 */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-line px-4 py-4 text-center">
      <a
        href="https://buymeacoffee.com/claytorres"
        target="_blank"
        rel="noopener noreferrer"
        className="tap inline-flex min-h-[44px] items-center gap-2 px-2 text-sm text-ink-dim hover:text-ink"
      >
        <span aria-hidden="true">☕</span>
        Buy me a coffee
      </a>
    </footer>
  );
}
