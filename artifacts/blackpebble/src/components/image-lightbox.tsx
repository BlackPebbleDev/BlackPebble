import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * Premium fullscreen image viewer — used for the token banner and token
 * avatar. Soft backdrop blur, aspect-ratio preserved (never stretched),
 * closes on ESC, backdrop click, or (on touch devices) a downward swipe.
 * Purely presentational — no trading/data behaviour attached.
 */
export function ImageLightbox({
  src,
  alt,
  open,
  onClose,
}: {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}) {
  const touchStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setDragY(0);
  }, [open]);

  if (!open) return null;

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (touchStartY.current == null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) setDragY(delta);
  }
  function onTouchEnd() {
    if (dragY > 90) {
      onClose();
    } else {
      setDragY(0);
    }
    touchStartY.current = null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={onClose}
      data-testid="image-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        data-testid="button-close-lightbox"
        aria-label="Close"
        className="absolute top-4 right-4 sm:top-6 sm:right-6 w-9 h-9 rounded-full bg-secondary/80 text-foreground/80 hover:text-foreground hover:bg-secondary flex items-center justify-center transition-colors z-10"
      >
        <X className="w-4 h-4" />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          opacity: dragY ? Math.max(1 - dragY / 300, 0.4) : 1,
        }}
        className="max-w-[92vw] max-h-[88vh] w-auto h-auto object-contain rounded-xl shadow-elevated select-none animate-in zoom-in-95 duration-200"
      />
    </div>
  );
}
