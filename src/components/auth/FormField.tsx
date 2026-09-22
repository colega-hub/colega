import type { InputHTMLAttributes } from "react";

export function FormField({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground/90">{label}</span>
      <input
        {...props}
        className="h-11 rounded-xl border border-border bg-white/[0.03] px-4 text-sm text-foreground placeholder:text-muted-dim/70 outline-none transition-colors focus:border-accent/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}
