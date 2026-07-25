import { Construction, type LucideIcon } from "lucide-react";

export function ComingSoon({
  title,
  icon: Icon = Construction,
}: {
  title: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="glass-card flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-24 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This module is scheduled for a later build phase.
      </p>
    </div>
  );
}
