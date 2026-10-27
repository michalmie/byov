// BYOV brand: the pink DJ octopus mascot in sunglasses and headphones.

import Image from "next/image";

interface LogoProps {
  className?: string;
}

export function LogoMark({ className = "h-6 w-6" }: LogoProps) {
  return (
    <Image
      src="/byov-octopus.jpg"
      alt=""
      width={48}
      height={48}
      className={`${className} rounded-[6px]`}
    />
  );
}

export function Logo({ className = "" }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="h-6 w-6" />
      <span className="text-[15px] font-bold tracking-tight">BYOV</span>
    </span>
  );
}
