import type { RetailerId } from "./allowlist";
import { retailerName } from "./allowlist";

export type BlockedRetailer = {
  retailerId: RetailerId;
  retailerName: string;
  url: string;
  reason: string;
};

export function blockedRetailer(
  retailerId: RetailerId,
  url: string,
  reason: string,
): BlockedRetailer {
  return {
    retailerId,
    retailerName: retailerName(retailerId),
    url,
    reason,
  };
}
