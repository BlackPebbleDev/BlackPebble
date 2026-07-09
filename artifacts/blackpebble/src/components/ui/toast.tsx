import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      // Bottom-anchored everywhere. On mobile/tablet it sits ABOVE the fixed
      // bottom tab bar (bottom-20) so it never covers navigation; on desktop
      // (md+, no tab bar) it's a bottom-right stack.
      "fixed inset-x-0 bottom-20 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 md:inset-x-auto md:bottom-0 md:right-0 md:w-auto md:max-w-[400px]",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

/**
 * Premium BlackPebble toast. ONE shared dark-glass base that every toast()
 * caller inherits; semantic `variant`s only change a subtle accent (left bar +
 * icon glow), never the loud fill. Backward-compatible: `default` and
 * `destructive` still work for existing callers.
 */
const toastVariants = cva(
  cn(
    "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl border p-4 pr-9",
    // Dark glass: translucent premium card, blur, deep shadow, hairline border.
    "border-white/10 bg-zinc-950/80 text-foreground shadow-[0_8px_40px_-8px_rgba(0,0,0,0.7)] backdrop-blur-xl",
    // Subtle left accent bar (color set per variant).
    "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
    // Swipe + open/close animation (unchanged behavior).
    "transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-bottom-full"
  ),
  {
    variants: {
      variant: {
        default: "before:bg-white/20",
        destructive: "before:bg-red-500 shadow-[0_8px_40px_-8px_rgba(220,38,38,0.35)]",
        // Semantic activity accents (subtle — accent edge + icon glow only).
        positive: "before:bg-emerald-500",
        exit: "before:bg-sky-500",
        profit: "before:bg-emerald-400",
        loss: "before:bg-orange-500",
        critical: "before:bg-red-500 shadow-[0_8px_40px_-8px_rgba(220,38,38,0.35)]",
        reputation: "before:bg-amber-400",
        campaign: "before:bg-amber-500",
        recovery: "before:bg-cyan-400",
        social: "before:bg-violet-500",
        warning: "before:bg-amber-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export type ToastVariant = NonNullable<
  VariantProps<typeof toastVariants>["variant"]
>

/** Icon/accent text color per variant, used by the Toaster for the icon glow. */
export const TOAST_ACCENT_TEXT: Record<ToastVariant, string> = {
  default: "text-foreground/70",
  destructive: "text-red-400",
  positive: "text-emerald-400",
  exit: "text-sky-400",
  profit: "text-emerald-300",
  loss: "text-orange-400",
  critical: "text-red-400",
  reputation: "text-amber-300",
  campaign: "text-amber-400",
  recovery: "text-cyan-300",
  social: "text-violet-400",
  warning: "text-amber-400",
}

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-foreground/90 ring-offset-background transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-md p-1 text-foreground/40 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold leading-tight tracking-tight", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-xs leading-snug text-foreground/70", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
