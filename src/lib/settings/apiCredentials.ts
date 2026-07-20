export type AmazonPaApiCredentials = {
  accessKey: string;
  secretKey: string;
  partnerTag: string;
  marketplace: string;
};

export type WalmartAffiliateCredentials = {
  consumerId: string;
  privateKeyPem: string;
  keyVersion: string;
  publisherId: string;
};

export type ApiCredentials = {
  amazon: AmazonPaApiCredentials | null;
  walmart: WalmartAffiliateCredentials | null;
};

export type ApiSettingsPatch = {
  amazonAccessKey?: string;
  amazonSecretKey?: string;
  amazonPartnerTag?: string;
  amazonMarketplace?: string;
  walmartConsumerId?: string;
  walmartPrivateKey?: string;
  walmartKeyVersion?: string;
  walmartPublisherId?: string;
};

export type ApiSettingsPublic = {
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

let cached: ApiCredentials = { amazon: null, walmart: null };

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hint(value: string | null | undefined): string | null {
  const trimmed = trimOrNull(value);
  if (!trimmed || trimmed.length < 4) return trimmed;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-2)}`;
}

function fromEnv(): ApiCredentials {
  const amazonAccessKey = trimOrNull(process.env.AMAZON_PAAPI_ACCESS_KEY);
  const amazonSecretKey = trimOrNull(process.env.AMAZON_PAAPI_SECRET_KEY);
  const amazonPartnerTag = trimOrNull(process.env.AMAZON_PAAPI_PARTNER_TAG);
  const walmartConsumerId = trimOrNull(process.env.WALMART_AFFILIATE_CONSUMER_ID);
  const walmartPrivateKey = trimOrNull(process.env.WALMART_AFFILIATE_PRIVATE_KEY);
  const walmartPublisherId = trimOrNull(process.env.WALMART_AFFILIATE_PUBLISHER_ID);

  return {
    amazon:
      amazonAccessKey && amazonSecretKey && amazonPartnerTag
        ? {
            accessKey: amazonAccessKey,
            secretKey: amazonSecretKey,
            partnerTag: amazonPartnerTag,
            marketplace: trimOrNull(process.env.AMAZON_PAAPI_MARKETPLACE) ?? "www.amazon.com",
          }
        : null,
    walmart:
      walmartConsumerId && walmartPrivateKey && walmartPublisherId
        ? {
            consumerId: walmartConsumerId,
            privateKeyPem: walmartPrivateKey.replace(/\\n/g, "\n"),
            keyVersion: trimOrNull(process.env.WALMART_AFFILIATE_KEY_VERSION) ?? "1",
            publisherId: walmartPublisherId,
          }
        : null,
  };
}

export function setApiCredentials(next: ApiCredentials) {
  cached = next;
}

export function getApiCredentials(): ApiCredentials {
  return cached;
}

export function hasAmazonPaApi(): boolean {
  return cached.amazon != null;
}

export function hasWalmartAffiliateApi(): boolean {
  return cached.walmart != null;
}

export function credentialsFromDbRow(row: {
  amazonAccessKey: string | null;
  amazonSecretKey: string | null;
  amazonPartnerTag: string | null;
  amazonMarketplace: string | null;
  walmartConsumerId: string | null;
  walmartPrivateKey: string | null;
  walmartKeyVersion: string | null;
  walmartPublisherId: string | null;
} | null): ApiCredentials {
  const env = fromEnv();
  if (!row) return env;

  const amazonAccessKey = trimOrNull(row.amazonAccessKey) ?? env.amazon?.accessKey ?? null;
  const amazonSecretKey = trimOrNull(row.amazonSecretKey) ?? env.amazon?.secretKey ?? null;
  const amazonPartnerTag = trimOrNull(row.amazonPartnerTag) ?? env.amazon?.partnerTag ?? null;
  const walmartConsumerId =
    trimOrNull(row.walmartConsumerId) ?? env.walmart?.consumerId ?? null;
  const walmartPrivateKey =
    trimOrNull(row.walmartPrivateKey)?.replace(/\\n/g, "\n") ??
    env.walmart?.privateKeyPem ??
    null;
  const walmartPublisherId =
    trimOrNull(row.walmartPublisherId) ?? env.walmart?.publisherId ?? null;

  return {
    amazon:
      amazonAccessKey && amazonSecretKey && amazonPartnerTag
        ? {
            accessKey: amazonAccessKey,
            secretKey: amazonSecretKey,
            partnerTag: amazonPartnerTag,
            marketplace:
              trimOrNull(row.amazonMarketplace) ?? env.amazon?.marketplace ?? "www.amazon.com",
          }
        : env.amazon,
    walmart:
      walmartConsumerId && walmartPrivateKey && walmartPublisherId
        ? {
            consumerId: walmartConsumerId,
            privateKeyPem: walmartPrivateKey,
            keyVersion:
              trimOrNull(row.walmartKeyVersion) ?? env.walmart?.keyVersion ?? "1",
            publisherId: walmartPublisherId,
          }
        : env.walmart,
  };
}

export function toPublicSettings(row: {
  amazonAccessKey: string | null;
  amazonSecretKey: string | null;
  amazonPartnerTag: string | null;
  amazonMarketplace: string | null;
  walmartConsumerId: string | null;
  walmartPrivateKey: string | null;
  walmartKeyVersion: string | null;
  walmartPublisherId: string | null;
} | null): ApiSettingsPublic {
  const creds = credentialsFromDbRow(row);
  return {
    amazon: {
      configured: creds.amazon != null,
      partnerTag: row?.amazonPartnerTag?.trim() || creds.amazon?.partnerTag || null,
      marketplace: row?.amazonMarketplace?.trim() || creds.amazon?.marketplace || null,
      accessKeyHint: hint(row?.amazonAccessKey ?? creds.amazon?.accessKey),
    },
    walmart: {
      configured: creds.walmart != null,
      consumerIdHint: hint(row?.walmartConsumerId ?? creds.walmart?.consumerId),
      publisherId: row?.walmartPublisherId?.trim() || creds.walmart?.publisherId || null,
      keyVersion: row?.walmartKeyVersion?.trim() || creds.walmart?.keyVersion || null,
    },
  };
}

export function normalizeSettingsPatch(patch: ApiSettingsPatch) {
  const emptyToNull = (value: string | undefined) => {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return {
    amazonAccessKey: emptyToNull(patch.amazonAccessKey),
    amazonSecretKey: emptyToNull(patch.amazonSecretKey),
    amazonPartnerTag: emptyToNull(patch.amazonPartnerTag),
    amazonMarketplace: emptyToNull(patch.amazonMarketplace),
    walmartConsumerId: emptyToNull(patch.walmartConsumerId),
    walmartPrivateKey: emptyToNull(patch.walmartPrivateKey),
    walmartKeyVersion: emptyToNull(patch.walmartKeyVersion),
    walmartPublisherId: emptyToNull(patch.walmartPublisherId),
  };
}
