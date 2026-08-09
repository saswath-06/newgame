"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { soundManager } from "@/lib/sound";

type Variant = "primary" | "ghost" | "danger";
type Size = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  silent?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-2xl font-display font-semibold tracking-wide transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none select-none cursor-pointer";

const variants: Record<Variant, string> = {
  primary:
    "text-ink bg-gradient-to-r from-rose to-violet shadow-[0_4px_24px_rgba(255,77,125,0.35)] hover:shadow-[0_4px_32px_rgba(139,92,246,0.5)] hover:brightness-110",
  ghost:
    "text-ink glass hover:bg-white/[0.07] hover:border-white/20",
  danger: "text-ink bg-danger/90 hover:bg-danger",
};

const sizes: Record<Size, string> = {
  md: "text-sm px-5 py-2.5",
  lg: "text-base px-8 py-4",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", silent, className = "", onClick, onMouseEnter, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        onClick={(e) => {
          if (!silent) soundManager.play("click");
          onClick?.(e);
        }}
        onMouseEnter={(e) => {
          if (!silent) soundManager.play("hover");
          onMouseEnter?.(e);
        }}
        {...rest}
      />
    );
  },
);
