export function cents(amount: number): number {
  return Math.round(amount * 100);
}

export function formatUsd(centsValue: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(centsValue / 100);
}

export function getTaxRate(): number {
  const parsed = Number(process.env.TAX_RATE ?? "0.08");
  return Number.isFinite(parsed) ? parsed : 0.08;
}

export function estimateTaxCents(itemCents: number, shippingCents: number, publishedTax?: number | null) {
  if (typeof publishedTax === "number" && Number.isFinite(publishedTax)) {
    return Math.max(0, Math.round(publishedTax));
  }
  return Math.round((itemCents + shippingCents) * getTaxRate());
}

export function totalLandedCents(
  itemCents: number,
  shippingCents: number,
  publishedTax?: number | null,
) {
  const tax = estimateTaxCents(itemCents, shippingCents, publishedTax);
  return {
    taxCents: tax,
    totalCents: itemCents + shippingCents + tax,
  };
}
