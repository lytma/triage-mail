import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({
  href = "/",
  className,
  withWordmark = true,
}: {
  href?: string;
  className?: string;
  withWordmark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2 font-display font-bold", className)}
      style={{ fontSize: "var(--brand-size)", color: "var(--color-fg)" }}
    >
      <Image
        src="/brand/logo.png"
        alt="Triage Mail"
        width={50}
        height={50}
        style={{ height: "var(--logo-h)", width: "auto" }}
        priority
      />
      {withWordmark && <span>Triage Mail</span>}
    </Link>
  );
}
