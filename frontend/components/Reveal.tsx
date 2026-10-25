"use client";
import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

/** Fires once the element has crossed far enough into the viewport. */
export function useInView<T extends HTMLElement>(amount = 0.12, once = true) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No observer (old browser, test runner): show everything rather than nothing.
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      // A little short of the bottom edge, so a block is already moving when you reach it.
      { threshold: amount, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [amount, once]);

  return [ref, inView] as const;
}

type Variant = "up" | "left" | "right" | "pop" | "fade";

const VARIANT: Record<Variant, string> = {
  up: "",
  left: "reveal-left",
  right: "reveal-right",
  pop: "reveal-pop",
  fade: "reveal-fade",
};

/**
 * Hides its content until it is scrolled to, then plays it in once.
 * With `stagger`, the direct children arrive one after another instead.
 */
export function Reveal({
  children,
  as: Tag = "div" as ElementType,
  variant = "up",
  delay = 0,
  step,
  stagger = false,
  once = true,
  amount = 0.12,
  className = "",
  style,
  id,
  role,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: {
  children: ReactNode;
  as?: ElementType;
  variant?: Variant;
  /** Milliseconds before this block (or the first child) starts. */
  delay?: number;
  /** Milliseconds between staggered children. */
  step?: number;
  stagger?: boolean;
  /** Replay every time it re-enters the viewport. */
  once?: boolean;
  amount?: number;
  className?: string;
  style?: CSSProperties;
  id?: string;
  role?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const [ref, inView] = useInView<HTMLElement>(amount, once);
  const base = stagger ? `stagger ${variant === "up" ? "" : `stagger-${variant}`}` : `reveal ${VARIANT[variant]}`;

  return (
    <Tag
      ref={ref}
      id={id}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      className={`${base} ${inView ? "in" : ""} ${className}`.replace(/\s+/g, " ").trim()}
      style={{ ...style, ...(delay ? { "--d": `${delay}ms` } : {}), ...(step ? { "--step": `${step}ms` } : {}) } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
