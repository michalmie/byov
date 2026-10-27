// BYOV brand: the pink DJ octopus mascot in sunglasses and headphones.

import Image from "next/image";

interface LogoProps {
  className?: string;
}

export function LogoMark({ className = "h-8 w-8" }: LogoProps) {
  return (
    <Image
      src="/byov-octopus.jpg"
      alt=""
      width={64}
      height={64}
      className={`${className} rounded-[8px]`}
    />
  );
}

export function Logo({ className = "" }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-[15px] font-bold tracking-tight">BYOV</span>
    </span>
  );
}
