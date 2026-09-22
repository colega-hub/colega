import { Star } from "lucide-react";

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  company: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TestimonialCard({ quote, name, role, company }: Testimonial) {
  return (
    <div className="card-surface flex h-full w-[320px] shrink-0 flex-col gap-4 rounded-2xl p-6 transition-colors duration-300 hover:border-white/[0.16] hover:bg-white/[0.04] sm:w-[360px]">
      <div className="flex gap-0.5 text-accent-strong">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} size={14} fill="currentColor" strokeWidth={0} />
        ))}
      </div>
      <p className="text-sm leading-relaxed text-muted">&ldquo;{quote}&rdquo;</p>
      <div className="mt-auto flex items-center gap-3 pt-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-accent-strong">
          {initials(name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          <p className="truncate text-xs text-muted-dim">
            {role} · {company}
          </p>
        </div>
      </div>
    </div>
  );
}
