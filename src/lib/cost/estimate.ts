/**
 * AWS Pricing Constants for us-east-1 (published 2025/2026 rates).
 * Note: These are static estimation constants and not pulled live from the AWS Pricing API.
 */
export const AWS_US_EAST_1_PRICING = {
  // S3 Standard storage per GB-month ($0.023/GB)
  s3StoragePerGbMonth: 0.023,
  // S3 PUT/POST requests per 1,000 requests (upload phase)
  s3PutPer1000: 0.005,
  // CloudFront Data Transfer Out per GB (First 10 TB tier: $0.085/GB)
  cloudfrontDataTransferOutPerGb: 0.085,
  // CloudFront HTTPS requests per 10,000 requests ($0.0075/10k)
  cloudfrontHttpsPer10k: 0.0075,
  // Low-traffic benchmark assumptions
  assumedMonthlyVisits: 10_000,
  caveat: "Estimate assumes ~10,000 visits/month on the free tier boundary — actual costs vary with real traffic.",
} as const;

export interface CostBreakdown {
  s3StorageUsd: number;
  s3PutOneTimeUsd: string;
  cloudfrontTransferUsd: number;
  cloudfrontRequestsUsd: number;
}

export interface CostEstimate {
  totalMonthlyCostUsd: number;
  formattedMonthlyCost: string;
  breakdown: CostBreakdown;
  assumptions: {
    monthlyVisits: number;
    totalSizeBytes: number;
    totalSizeFormatted: string;
    caveat: string;
  };
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Calculates a deterministic monthly AWS cost estimate for a static site deployment
 * based on uploaded artifact byte size and standard low-traffic traffic assumptions.
 */
export function estimateMonthlyCost(totalSizeBytes: number): CostEstimate {
  const safeBytes = Math.max(0, totalSizeBytes);
  const sizeGb = safeBytes / (1024 * 1024 * 1024);

  // 1. S3 Storage: total uploaded bytes stored for 1 month
  const s3StorageUsd = sizeGb * AWS_US_EAST_1_PRICING.s3StoragePerGbMonth;

  // 2. S3 PUT requests: one-time upload cost (negligible, ~$0.00 for typical site sizes)
  const s3PutOneTimeUsd = "~$0.00";

  // 3. CloudFront Data Transfer Out: total site weight * assumed monthly visits
  const monthlyTransferGb = sizeGb * AWS_US_EAST_1_PRICING.assumedMonthlyVisits;
  const cloudfrontTransferUsd = monthlyTransferGb * AWS_US_EAST_1_PRICING.cloudfrontDataTransferOutPerGb;

  // 4. CloudFront HTTPS Requests: assumed visits * pricing per 10k
  const cloudfrontRequestsUsd = (AWS_US_EAST_1_PRICING.assumedMonthlyVisits / 10_000) * AWS_US_EAST_1_PRICING.cloudfrontHttpsPer10k;

  const totalMonthlyCostUsd = s3StorageUsd + cloudfrontTransferUsd + cloudfrontRequestsUsd;

  // Format nicely for UI: e.g. "$0.02" or "< $0.01" if below 1 cent
  const formattedMonthlyCost = totalMonthlyCostUsd < 0.01
    ? "< $0.01"
    : `$${totalMonthlyCostUsd.toFixed(2)}`;

  return {
    totalMonthlyCostUsd: Number(totalMonthlyCostUsd.toFixed(4)),
    formattedMonthlyCost,
    breakdown: {
      s3StorageUsd: Number(s3StorageUsd.toFixed(5)),
      s3PutOneTimeUsd,
      cloudfrontTransferUsd: Number(cloudfrontTransferUsd.toFixed(4)),
      cloudfrontRequestsUsd: Number(cloudfrontRequestsUsd.toFixed(4)),
    },
    assumptions: {
      monthlyVisits: AWS_US_EAST_1_PRICING.assumedMonthlyVisits,
      totalSizeBytes: safeBytes,
      totalSizeFormatted: formatBytes(safeBytes),
      caveat: AWS_US_EAST_1_PRICING.caveat,
    },
  };
}
