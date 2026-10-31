"use client";

import { useEffect, useState } from "react";

/**
 * The share row on a public card and on the account page.
 *
 * No third-party SDKs: the link is copied from the clipboard, and WhatsApp and
 * X get plain intent URLs. On a phone the native sheet is offered instead.
 */
export function ShareButtons({
  url,
  text,
  compact = false,
}: {
  url: string;
  text: string;
  compact?: boolean;
}) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const link = origin ? `${origin}${url}` : url;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const native = async () => {
    if (navigator.share) {
      await navigator.share({ title: "Twenty-Eight", text, url: link }).catch(() => undefined);
    } else {
      await copy();
    }
  };

  const base =
    "rounded-full border px-3.5 py-2 text-[12px] font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold/60";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className={`${base} border-gold/45 bg-gold/10 text-gold-soft hover:bg-gold/15`}
      >
        {copied ? "Link copied" : "Copy link"}
      </button>
      <a
        className={`${base} border-white/15 text-cream/80 hover:border-white/35`}
        href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        WhatsApp
      </a>
      <a
        className={`${base} border-white/15 text-cream/80 hover:border-white/35`}
        href={`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        Post
      </a>
      {!compact && (
        <button type="button" onClick={native} className={`${base} border-white/15 text-cream/70 hover:border-white/35`}>
          Share…
        </button>
      )}
    </div>
  );
}
