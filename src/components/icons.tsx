interface IconProps {
  className?: string;
}

export function IconPlay({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l10.9-6.86a1.04 1.04 0 0 0 0-1.76L9.56 4.26A1.04 1.04 0 0 0 8 5.14Z" />
    </svg>
  );
}

export function IconPause({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <rect x="6" y="4.5" width="4.2" height="15" rx="1" />
      <rect x="13.8" y="4.5" width="4.2" height="15" rx="1" />
    </svg>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconChevronLeft({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  );
}

export function IconChevronRight({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </svg>
  );
}

export function IconOrbit({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="4.4" fill="currentColor" />
      <ellipse cx="16" cy="16" rx="13.2" ry="5.6" stroke="currentColor" strokeWidth="1.4" transform="rotate(-24 16 16)" opacity="0.85" />
      <ellipse cx="16" cy="16" rx="8.6" ry="3.6" stroke="currentColor" strokeWidth="1.1" transform="rotate(-24 16 16)" opacity="0.45" />
      <circle cx="27" cy="10.4" r="1.9" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

export function IconInfo({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.6" r="0.4" fill="currentColor" />
    </svg>
  );
}
