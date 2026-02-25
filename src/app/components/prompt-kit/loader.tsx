"use client"

import * as React from "react"
import { cn } from "@/app/lib/utils"

// =============================================================================
// Loader
// =============================================================================

type LoaderVariant =
  | "circular"
  | "classic"
  | "pulse"
  | "pulse-dot"
  | "dots"
  | "typing"
  | "wave"
  | "bars"
  | "terminal"
  | "text-blink"
  | "text-shimmer"
  | "loading-dots"

type LoaderSize = "sm" | "md" | "lg"

interface LoaderProps {
  variant?: LoaderVariant
  size?: LoaderSize
  text?: string
  className?: string
}

const sizeMap: Record<LoaderSize, { dot: string; text: string; container: string }> = {
  sm: { dot: "h-1 w-1", text: "text-xs", container: "gap-1" },
  md: { dot: "h-1.5 w-1.5", text: "text-sm", container: "gap-1.5" },
  lg: { dot: "h-2 w-2", text: "text-base", container: "gap-2" },
}

function Loader({
  variant = "circular",
  size = "md",
  text,
  className,
}: LoaderProps) {
  const sizes = sizeMap[size]

  switch (variant) {
    case "dots":
      return (
        <span
          className={cn(
            "inline-flex items-center",
            sizes.container,
            className
          )}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                "bg-foreground/60 rounded-full animate-bounce",
                sizes.dot
              )}
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      )

    case "typing":
      return (
        <span
          className={cn(
            "inline-flex items-center",
            sizes.container,
            className
          )}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                "bg-foreground/50 rounded-full",
                sizes.dot
              )}
              style={{
                animation: "typing-bounce 1.4s infinite ease-in-out",
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </span>
      )

    case "pulse":
      return (
        <span
          className={cn("inline-flex items-center", sizes.container, className)}
        >
          <span
            className={cn(
              "bg-foreground/50 rounded-full animate-pulse",
              size === "sm" ? "h-2 w-2" : size === "md" ? "h-3 w-3" : "h-4 w-4"
            )}
          />
        </span>
      )

    case "pulse-dot":
      return (
        <span
          className={cn("relative inline-flex", className)}
        >
          <span
            className={cn(
              "bg-foreground/60 rounded-full animate-ping absolute",
              sizes.dot
            )}
          />
          <span
            className={cn("bg-foreground/60 rounded-full relative", sizes.dot)}
          />
        </span>
      )

    case "text-blink":
      return (
        <span
          className={cn(
            "inline-flex items-center",
            sizes.container,
            sizes.text,
            className
          )}
        >
          <span className="animate-pulse">{text || "Thinking"}</span>
        </span>
      )

    case "text-shimmer":
      return (
        <span
          className={cn(
            "inline-flex items-center text-muted-foreground font-semibold text-base",
            className
          )}
          style={{
            background:
              "linear-gradient(90deg, currentColor 25%, transparent 50%, currentColor 75%)",
            backgroundSize: "200% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: "shimmer 2s infinite linear",
          }}
        >
          {text || "Thinking"}
        </span>
      )

    case "loading-dots":
      return (
        <span
          className={cn(
            "inline-flex items-center text-muted-foreground",
            sizes.text,
            className
          )}
        >
          <span>{text || "Thinking"}</span>
          <span className="loading-dots-anim">...</span>
        </span>
      )

    case "wave":
      return (
        <span
          className={cn(
            "inline-flex items-end",
            sizes.container,
            className
          )}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                "bg-foreground/50 w-0.5 rounded-full",
                size === "sm" ? "h-2" : size === "md" ? "h-3" : "h-4"
              )}
              style={{
                animation: "wave 1.2s infinite ease-in-out",
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </span>
      )

    case "bars":
      return (
        <span
          className={cn(
            "inline-flex items-end",
            sizes.container,
            className
          )}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                "bg-foreground/50 w-1 rounded-sm",
                size === "sm" ? "h-2" : size === "md" ? "h-3" : "h-4"
              )}
              style={{
                animation: "bars 1s infinite ease-in-out",
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </span>
      )

    case "terminal":
      return (
        <span
          className={cn(
            "inline-flex items-center text-muted-foreground",
            sizes.text,
            className
          )}
        >
          <span className="animate-pulse">▊</span>
        </span>
      )

    case "classic":
      return (
        <span
          className={cn("inline-block", className)}
        >
          <span
            className={cn(
              "border-foreground/20 border-t-foreground/60 rounded-full border-2 inline-block",
              size === "sm"
                ? "h-3 w-3"
                : size === "md"
                  ? "h-4 w-4"
                  : "h-5 w-5"
            )}
            style={{ animation: "spin 0.8s linear infinite" }}
          />
        </span>
      )

    case "circular":
    default:
      return (
        <span
          className={cn("inline-block", className)}
        >
          <span
            className={cn(
              "border-foreground/20 border-t-foreground/60 rounded-full border-2 inline-block animate-spin",
              size === "sm"
                ? "h-3 w-3"
                : size === "md"
                  ? "h-4 w-4"
                  : "h-5 w-5"
            )}
          />
        </span>
      )
  }
}

export { Loader }
export type { LoaderVariant, LoaderSize }
