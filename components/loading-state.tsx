import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  label?: string;
  className?: string;
};

export function LoadingState({ label, className }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "text-muted-foreground flex min-h-40 w-full flex-col items-center justify-center gap-2",
        className,
      )}
    >
      <Loader2 className="h-5 w-5 animate-spin" />
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  );
}
