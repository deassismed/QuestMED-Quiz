"use client";

import { Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";

export function QrCodeViewer({
  alt,
  caption,
  className,
  src
}: {
  alt: string;
  caption: string;
  className: string;
  src: string;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnAnyKey(event: KeyboardEvent) {
      event.preventDefault();
      setExpanded(false);
    }

    window.addEventListener("keydown", closeOnAnyKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnAnyKey);
    };
  }, [expanded]);

  return (
    <>
      <button
        aria-label={`${caption || alt}. Ampliar QR Code`}
        className={`${className} qr-code-trigger`}
        onClick={() => setExpanded(true)}
        type="button"
      >
        <img alt={alt} src={src} />
        {caption ? <span>{caption}</span> : null}
        <Maximize2 aria-hidden="true" className="qr-expand-icon" size={18} />
      </button>

      {expanded ? (
        <div
          aria-label={`${caption || alt}. Pressione qualquer tecla para fechar.`}
          aria-modal="true"
          className="qr-modal-backdrop"
          onMouseDown={() => setExpanded(false)}
          role="dialog"
        >
          <button
            aria-label="Fechar QR Code"
            className="qr-modal-close"
            onClick={() => setExpanded(false)}
            type="button"
          >
            <X size={28} />
          </button>
          <div className="qr-modal-content" onMouseDown={(event) => event.stopPropagation()}>
            <img alt={alt} src={src} />
            <strong>{caption || alt}</strong>
            <span>Pressione qualquer tecla para fechar</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
