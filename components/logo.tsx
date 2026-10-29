// BYOV brand: the stacked logo (octopus mascot over the BYOV wordmark)
// and the standalone octopus mark. Art lives in public/brand/.

import Image from "next/image";

/** Canonical BYOV logo: stacked mascot + wordmark on dark. */
export const LOGO_SRC = "/brand/byov-logo-stacked-1536x1024.png";

interface LogoProps {
  className?: string;
}

export function LogoMark({ className = "h-8 w-8" }: LogoProps) {
  return (
    <Image
      src="/brand/byov-mark-512.png"
      alt=""
      width={64}
      height={64}
      className={`${className} rounded-[8px]`}
    />
  );
}

export function Logo({ className = "h-auto w-full" }: LogoProps) {
  return (
    <Image
      src={LOGO_SRC}
      alt="BYOV"
      width={1536}
      height={1024}
      className={className}
    />
  );
}
