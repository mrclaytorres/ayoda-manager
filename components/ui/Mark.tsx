/**
 * The app mark — a green, long-eared sage. The same drawing as `app/icon.svg`, minus that file's
 * dark plate: the favicon needs a background to hold its own against browser chrome, while in the
 * app it sits on the page and reads better as a plain emblem. Next serves `icon.svg` from a hashed
 * route, so it cannot simply be referenced by path from here.
 *
 * Drawn from scratch rather than traced from the film character.
 */
export function Mark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <path d="M22 26 L2 10 C3 24 11 34 23 37 Z" fill="#a8cd84" />
      <path d="M42 26 L62 10 C61 24 53 34 41 37 Z" fill="#a8cd84" />
      <ellipse cx="32" cy="35" rx="17" ry="18" fill="#93bf6f" />
      <path
        d="M18 29 C22 25 27 25 29 28 M35 28 C37 25 42 25 46 29"
        stroke="#6f9b52"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="24" cy="36" rx="3.6" ry="4.2" fill="#20261c" />
      <ellipse cx="40" cy="36" rx="3.6" ry="4.2" fill="#20261c" />
      <path
        d="M26 46 C30 49 34 49 38 46"
        stroke="#6f9b52"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
