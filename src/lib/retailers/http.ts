const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export type PageFetchResult = {
  ok: boolean;
  status: number;
  url: string;
  text: string;
  blocked?: boolean;
  blockedReason?: string;
  viaBrowser?: boolean;
};

let browserFetchFn: ((url: string) => Promise<PageFetchResult>) | null = null;

/** Register Electron hidden-browser fetch (desktop main process only). */
export function setBrowserFetch(fn: (url: string) => Promise<PageFetchResult>) {
  browserFetchFn = fn;
}

export function isBlockedPage(url: string, text: string): boolean {
  return /\/blocked|captcha|access denied|robot check|attention required|unusual traffic|automated access/i.test(
    (url + text).slice(0, 5000),
  );
}

export async function fetchText(
  url: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; url: string; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        ...DEFAULT_HEADERS,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, text };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fast plain fetch first; fall back to hidden Chromium when bot-blocked or empty.
 */
export async function fetchPage(
  url: string,
  init: RequestInit = {},
): Promise<PageFetchResult> {
  const plain = await fetchText(url, init);
  if (plain.ok && plain.text.length >= 400 && !isBlockedPage(plain.url, plain.text)) {
    return { ...plain, viaBrowser: false };
  }

  const plainBlocked = isBlockedPage(plain.url, plain.text);
  if (browserFetchFn && (plainBlocked || !plain.ok || plain.text.length < 400)) {
    try {
      const browser = await browserFetchFn(url);
      if (
        browser.ok &&
        browser.text.length >= 400 &&
        !isBlockedPage(browser.url, browser.text)
      ) {
        return browser;
      }
      return {
        ...browser,
        blocked: true,
        blockedReason: browser.blockedReason ?? "bot-wall",
        viaBrowser: true,
      };
    } catch (err) {
      return {
        ok: false,
        status: plain.status,
        url: plain.url,
        text: plain.text,
        blocked: true,
        blockedReason: err instanceof Error ? err.message : "browser-fetch-failed",
        viaBrowser: false,
      };
    }
  }

  return {
    ...plain,
    blocked: plainBlocked || !plain.ok,
    blockedReason: plainBlocked
      ? "bot-wall"
      : plain.ok
        ? "empty-page"
        : `http-${plain.status}`,
    viaBrowser: false,
  };
}
