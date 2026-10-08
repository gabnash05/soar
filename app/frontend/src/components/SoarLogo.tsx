export const SoarLogo = ({ className = '', title = 'SOAR' }: { className?: string; title?: string }) => (
  <span className={`soar-logo ${className}`} aria-label={title} role="img">
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M14 43c7 9 20 11 30 4 8-6 7-15 0-18-5-2-12 0-18-3-7-3-7-12-1-15 7-6 18-5 25 2"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        className="soar-logo__accent"
        d="M42 11h10v10M51 12 39 24"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);
