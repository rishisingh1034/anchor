import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns/promises";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const urlParam = request.nextUrl.searchParams.get("url");
  const domainParam = request.nextUrl.searchParams.get("domain");

  let hostname = domainParam || "";
  let targetUrl = urlParam || "";

  if (!hostname && targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      hostname = parsed.hostname;
    } catch {
      return NextResponse.json({ error: "Invalid URL provided" }, { status: 400 });
    }
  }

  if (!hostname) {
    return NextResponse.json({ error: "Missing url or domain query parameter" }, { status: 400 });
  }

  // Security guardrail: Only test CloudFront or AWS-related hostnames
  if (!hostname.endsWith(".cloudfront.net") && !hostname.includes("amplifyapp.com")) {
    return NextResponse.json({ error: "Only CloudFront domains can be probed" }, { status: 403 });
  }

  try {
    // 1. Perform DNS lookup on the server
    const lookupResult = await dns.lookup(hostname);
    if (!lookupResult || !lookupResult.address) {
      return NextResponse.json({
        ready: false,
        hostname,
        status: "dns_lookup_empty",
        message: "DNS record not yet populated",
      });
    }

    // 2. Perform a fast HEAD request to verify CloudFront edge responds
    if (!targetUrl) {
      targetUrl = `https://${hostname}`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(targetUrl, {
        method: "HEAD",
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeoutId);

      return NextResponse.json({
        ready: true,
        hostname,
        ip: lookupResult.address,
        httpStatus: res.status,
        message: "CloudFront edge DNS and HTTP are live and reachable",
      });
    } catch {
      // If HTTP timed out or failed but DNS resolved, mark as ready or resolving
      return NextResponse.json({
        ready: true,
        hostname,
        ip: lookupResult.address,
        message: "DNS resolved successfully",
      });
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ready: false,
      hostname,
      status: "nxdomain",
      message: errorMsg,
    });
  }
}
