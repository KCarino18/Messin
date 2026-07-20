"use client";

import { useEffect, useState, useTransition } from "react";
import { desktop } from "@/lib/desktopClient";

type PublicSettings = {
  amazon: {
    configured: boolean;
    partnerTag: string | null;
    marketplace: string | null;
    accessKeyHint: string | null;
  };
  walmart: {
    configured: boolean;
    consumerIdHint: string | null;
    publisherId: string | null;
    keyVersion: string | null;
  };
};

const inputClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--mist)] px-3 py-2 text-sm text-[var(--parchment)] outline-none focus:border-[var(--brass-400)]/60";

export function ApiSettingsPanel() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<PublicSettings | null>(null);
  const [amazonAccessKey, setAmazonAccessKey] = useState("");
  const [amazonSecretKey, setAmazonSecretKey] = useState("");
  const [amazonPartnerTag, setAmazonPartnerTag] = useState("");
  const [amazonMarketplace, setAmazonMarketplace] = useState("www.amazon.com");
  const [walmartConsumerId, setWalmartConsumerId] = useState("");
  const [walmartPrivateKey, setWalmartPrivateKey] = useState("");
  const [walmartKeyVersion, setWalmartKeyVersion] = useState("1");
  const [walmartPublisherId, setWalmartPublisherId] = useState("");
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState("");

  useEffect(() => {
    startTransition(async () => {
      const data = (await desktop().getApiSettings()) as PublicSettings;
      setSaved(data);
      if (data.amazon.partnerTag) setAmazonPartnerTag(data.amazon.partnerTag);
      if (data.amazon.marketplace) setAmazonMarketplace(data.amazon.marketplace);
      if (data.walmart.publisherId) setWalmartPublisherId(data.walmart.publisherId);
      if (data.walmart.keyVersion) setWalmartKeyVersion(data.walmart.keyVersion);
    });
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const patch: Record<string, string> = {};
      if (amazonAccessKey.trim()) patch.amazonAccessKey = amazonAccessKey.trim();
      if (amazonSecretKey.trim()) patch.amazonSecretKey = amazonSecretKey.trim();
      if (amazonPartnerTag.trim()) patch.amazonPartnerTag = amazonPartnerTag.trim();
      if (amazonMarketplace.trim()) patch.amazonMarketplace = amazonMarketplace.trim();
      if (walmartConsumerId.trim()) patch.walmartConsumerId = walmartConsumerId.trim();
      if (walmartPrivateKey.trim()) patch.walmartPrivateKey = walmartPrivateKey.trim();
      if (walmartKeyVersion.trim()) patch.walmartKeyVersion = walmartKeyVersion.trim();
      if (walmartPublisherId.trim()) patch.walmartPublisherId = walmartPublisherId.trim();

      const data = (await desktop().setApiSettings(patch)) as PublicSettings;
      setSaved(data);
      setAmazonAccessKey("");
      setAmazonSecretKey("");
      setWalmartPrivateKey("");
      setFlash("Saved. Official APIs will be used when keys are valid.");
      window.setTimeout(() => setFlash(""), 3000);
    });
  }

  return (
    <div className="max-w-3xl rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.15)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--brass-300)]/90">
          Official retailer APIs (optional)
        </span>
        <span className="text-[var(--parchment)]/50">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <form onSubmit={submit} className="space-y-4 border-t border-[var(--line)] px-4 py-4">
          <p className="text-xs leading-relaxed text-[var(--parchment)]/60">
            Add your own Amazon Product Advertising API (Associates) and Walmart Affiliate API
            keys for reliable Amazon/Walmart prices without browser scraping. Keys stay on this
            device in your local database. Leave secret fields blank to keep existing values.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-[var(--parchment)]/70">
              <span>Amazon access key</span>
              <input
                type="password"
                autoComplete="off"
                placeholder={saved?.amazon.accessKeyHint ?? "AKIA…"}
                value={amazonAccessKey}
                onChange={(e) => setAmazonAccessKey(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-xs text-[var(--parchment)]/70">
              <span>Amazon secret key</span>
              <input
                type="password"
                autoComplete="off"
                placeholder={saved?.amazon.configured ? "••••••••" : "Secret"}
                value={amazonSecretKey}
                onChange={(e) => setAmazonSecretKey(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-xs text-[var(--parchment)]/70">
              <span>Amazon partner tag</span>
              <input
                type="text"
                value={amazonPartnerTag}
                onChange={(e) => setAmazonPartnerTag(e.target.value)}
                placeholder="yourtag-20"
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-xs text-[var(--parchment)]/70">
              <span>Amazon marketplace</span>
              <input
                type="text"
                value={amazonMarketplace}
                onChange={(e) => setAmazonMarketplace(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-[var(--parchment)]/70">
              <span>Walmart consumer ID</span>
              <input
                type="text"
                placeholder={saved?.walmart.consumerIdHint ?? "Consumer ID"}
                value={walmartConsumerId}
                onChange={(e) => setWalmartConsumerId(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-xs text-[var(--parchment)]/70">
              <span>Walmart publisher ID (Impact)</span>
              <input
                type="text"
                value={walmartPublisherId}
                onChange={(e) => setWalmartPublisherId(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-xs text-[var(--parchment)]/70">
              <span>Walmart key version</span>
              <input
                type="text"
                value={walmartKeyVersion}
                onChange={(e) => setWalmartKeyVersion(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-xs text-[var(--parchment)]/70 sm:col-span-2">
              <span>Walmart RSA private key (PEM)</span>
              <textarea
                rows={4}
                placeholder={
                  saved?.walmart.configured
                    ? "-----BEGIN RSA PRIVATE KEY----- (saved)"
                    : "-----BEGIN RSA PRIVATE KEY-----"
                }
                value={walmartPrivateKey}
                onChange={(e) => setWalmartPrivateKey(e.target.value)}
                className={`${inputClass} font-mono text-[11px]`}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-[var(--brass-400)]/50 bg-[rgba(180,140,60,0.12)] px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[var(--brass-200)] disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save API keys"}
            </button>
            {saved && (
              <span className="text-xs text-[var(--parchment)]/55">
                Amazon: {saved.amazon.configured ? "configured" : "scrape fallback"} · Walmart:{" "}
                {saved.walmart.configured ? "configured" : "scrape fallback"}
              </span>
            )}
            {flash && <span className="text-xs text-[var(--emerald-300)]">{flash}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
