import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({ title, description, retryLabel, onRetry, className }: Props) {
  return (
    <div
      role="alert"
      className={cn(
        "border-destructive/30 bg-destructive/5 flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border p-8 text-center",
        className,
      )}
    >
      <AlertCircle className="text-destructive h-6 w-6" />
      {title ? <h3 className="text-base font-medium">{title}</h3> : null}
      {description ? <p className="text-muted-foreground max-w-md text-sm">{description}</p> : null}
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {retryLabel ?? "Retry"}
        </Button>
      ) : null}
    </div>
  );
}
