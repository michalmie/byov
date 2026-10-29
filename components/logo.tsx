// BYOV brand: the pink octopus mascot in sunglasses (mark) and the full
// horizontal lockup (mascot + BYOV wordmark). Art lives in public/brand/.

import Image from "next/image";

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

export function Logo({ className = "h-8 w-auto" }: LogoProps) {
  return (
    <Image
      src="/brand/byov-logo-horizontal-1400.png"
      alt="BYOV"
      width={1400}
      height={420}
      className={className}
    />
  );
}
