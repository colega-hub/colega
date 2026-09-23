"use client";

import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { isExternalHref } from "@/lib/download";
import type { ReactNode, ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-accent-strong to-accent text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_8px_24px_-8px_rgba(91,124,250,0.55)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.14)_inset,0_10px_32px_-8px_rgba(91,124,250,0.75)]",
  secondary:
    "bg-white text-[#0a0d18] shadow-[0_8px_24px_-8px_rgba(255,255,255,0.25)] hover:shadow-[0_10px_28px_-8px_rgba(255,255,255,0.35)]",
  outline:
    "border border-border-strong bg-white/[0.02] text-foreground hover:bg-white/[0.06] hover:border-white/25",
  ghost: "text-muted hover:text-foreground hover:bg-white/[0.05]",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-4 text-sm gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-13 px-7 text-base gap-2",
};

type BaseProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  icon?: ReactNode;
};

type ButtonAsButton = BaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type ButtonAsLink = BaseProps & {
  href: string;
  target?: string;
  rel?: string;
  onClick?: () => void;
};

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const { variant = "primary", size = "md", className, children, icon } = props;

  const classes = cn(
    "relative inline-flex items-center justify-center rounded-full font-medium tracking-tight",
    "transition-colors duration-200 whitespace-nowrap select-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-60",
    variantClasses[variant],
    sizeClasses[size],
    className
  );

  const content = (
    <>
      <span>{children}</span>
      {icon}
    </>
  );

  const motionProps = {
    whileHover: { scale: 1.03, y: -1 },
    whileTap: { scale: 0.98 },
    transition: { type: "spring" as const, stiffness: 400, damping: 25 },
  };

  if ("href" in props && props.href) {
    // Absolute URLs (e.g. the installer download) skip the locale-aware Link so they're never
    // rewritten with a locale prefix.
    if (isExternalHref(props.href)) {
      return (
        <motion.div {...motionProps} className="inline-block">
          <a
            href={props.href}
            target={props.target}
            rel={props.rel}
            onClick={props.onClick}
            className={classes}
          >
            {content}
          </a>
        </motion.div>
      );
    }

    return (
      <motion.div {...motionProps} className="inline-block">
        <Link
          href={props.href}
          target={props.target}
          rel={props.rel}
          onClick={props.onClick}
          className={classes}
        >
          {content}
        </Link>
      </motion.div>
    );
  }

  const buttonProps = props as ButtonAsButton;
  return (
    <motion.button
      {...motionProps}
      className={classes}
      type={buttonProps.type ?? "button"}
      onClick={buttonProps.onClick}
      disabled={buttonProps.disabled}
    >
      {content}
    </motion.button>
  );
}
