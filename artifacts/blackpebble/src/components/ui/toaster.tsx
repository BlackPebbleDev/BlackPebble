import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  TOAST_ACCENT_TEXT,
  type ToastVariant,
} from "@/components/ui/toast"
import { cn } from "@/lib/utils"

const CHIP_TONE: Record<string, string> = {
  up: "text-emerald-300 border-emerald-400/25 bg-emerald-400/10",
  down: "text-orange-300 border-orange-400/25 bg-orange-400/10",
  neutral: "text-foreground/70 border-white/10 bg-white/[0.04]",
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({
        id,
        title,
        description,
        action,
        icon,
        pfp,
        tokenLogo,
        chips,
        variant,
        ...props
      }) {
        const accentText = TOAST_ACCENT_TEXT[(variant ?? "default") as ToastVariant]
        const hasLead = Boolean(icon || pfp || tokenLogo)
        return (
          <Toast key={id} variant={variant} {...props}>
            {hasLead && (
              <div className="relative flex-shrink-0">
                {pfp ? (
                  <img
                    src={pfp}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover ring-1 ring-white/15"
                  />
                ) : tokenLogo ? (
                  <img
                    src={tokenLogo}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover ring-1 ring-white/15"
                  />
                ) : null}
                {icon && (
                  <span
                    className={cn(
                      "flex items-center justify-center",
                      // When there's an avatar/logo, badge the icon on top;
                      // otherwise the icon stands alone in a glass chip.
                      (pfp || tokenLogo)
                        ? "absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-zinc-950 ring-1 ring-white/15"
                        : "h-9 w-9 rounded-lg border border-white/10 bg-white/[0.04]",
                      accentText,
                    )}
                  >
                    {icon}
                  </span>
                )}
              </div>
            )}

            <div className="grid flex-1 gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
              {chips && chips.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {chips.map((c, i) => (
                    <span
                      key={i}
                      className={cn(
                        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                        CHIP_TONE[c.tone ?? "neutral"],
                      )}
                    >
                      {c.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
