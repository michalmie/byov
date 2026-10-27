// One hand-built icon set: 24px grid, 1.8px stroke, round caps. No mixing.

interface IconProps {
  className?: string;
}

function Base({
  className = "h-5 w-5",
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function GridIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Base>
  );
}

export function BoxIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" />
      <path d="M3.5 7.5 12 12l8.5-4.5" />
      <path d="M12 12v9" />
    </Base>
  );
}

export function StackIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <rect x="4" y="3.5" width="16" height="6.5" rx="1.5" />
      <rect x="4" y="14" width="16" height="6.5" rx="1.5" />
      <path d="M7.5 6.75h.01M7.5 17.25h.01" strokeWidth={2.4} />
    </Base>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  );
}

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </Base>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Base>
  );
}

export function LayersIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
      <path d="m3 12.5 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </Base>
  );
}

export function DeployIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M12 16V4" />
      <path d="m6 10 6-6 6 6" />
      <path d="M4 20h16" />
    </Base>
  );
}

export function ShieldCheckIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M12 3l7 2.5V11c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V5.5L12 3Z" />
      <path d="m9 11.5 2 2 4-4.5" />
    </Base>
  );
}

export function PulseIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <path d="M3 12h4l2.5-6 4 12L16 12h5" />
    </Base>
  );
}

export function GearIcon({ className }: IconProps) {
  return (
    <Base className={className}>
      <circle cx="12" cy="12" r="7.2" strokeDasharray="3.2 2.5" />
      <circle cx="12" cy="12" r="2.6" />
    </Base>
  );
}
