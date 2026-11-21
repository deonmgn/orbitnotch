import { createHash, timingSafeEqual } from "node:crypto";

const PRODUCT_ID = "4f55cbe6-1793-4119-b698-ace4bd335690";
const MAYAR_SOFTWARE_VERIFY_URL = "https://api.mayar.id/software/v1/license/verify";
const MAYAR_SAAS_VERIFY_URL = "https://api.mayar.id/saas/v1/license/verify";

interface VercelRequest {
  method?: string;
  body?: { licenseCode?: unknown } | string;
}

interface VercelResponse {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => { json: (data: unknown) => void; end: () => void };
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function isOwnerLicense(licenseCode: string, ownerEnv: string | undefined): boolean {
  if (!ownerEnv) return false;
  const candidateDigest = sha256(licenseCode);
  const configuredKeys = ownerEnv
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length >= 8);

  let matched = false;
  for (const key of configuredKeys) {
    const keyDigest = sha256(key);
    if (timingSafeEqual(candidateDigest, keyDigest)) {
      matched = true;
    }
  }
  return matched;
}

async function verifyWithMayar(url: string, apiKey: string, licenseCode: string) {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      licenseCode,
      productId: PRODUCT_ID,
    }),
    signal: AbortSignal.timeout(8000),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ valid: false, message: "Method not allowed" });
  }

  let parsedBody: { licenseCode?: unknown } = {};
  try {
    parsedBody =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  } catch {
    return res.status(400).json({ valid: false, message: "Invalid request payload" });
  }

  const rawCode = parsedBody?.licenseCode;
  const licenseCode = typeof rawCode === "string" ? rawCode.trim() : "";

  if (licenseCode.length < 6 || licenseCode.length > 128 || /[\x00-\x1f\x7f]/.test(licenseCode)) {
    return res.status(400).json({ valid: false, message: "Invalid license code format" });
  }

  if (isOwnerLicense(licenseCode, process.env.OWNER_LICENSE_KEY)) {
    return res.status(200).json({
      valid: true,
      message: "Owner Pro license verified",
      plan: "owner",
    });
  }

  const apiKey = process.env.MAYAR_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      valid: false,
      message: "License verification is not configured on server yet.",
    });
  }

  try {
    let upstream = await verifyWithMayar(MAYAR_SOFTWARE_VERIFY_URL, apiKey, licenseCode);
    if (upstream.status === 404) {
      upstream = await verifyWithMayar(MAYAR_SAAS_VERIFY_URL, apiKey, licenseCode);
    }

    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    const nested = (data?.data as Record<string, unknown> | undefined) ?? undefined;
    const isValid =
      upstream.ok &&
      (data?.isLicenseActive === true ||
        nested?.isLicenseActive === true ||
        data?.statusCode === 200 ||
        data?.valid === true);

    return res.status(isValid ? 200 : 400).json({
      valid: Boolean(isValid),
      message: isValid ? "License verified" : "Invalid or inactive license key",
      plan: isValid ? "pro" : undefined,
    });
  } catch {
    return res.status(502).json({
      valid: false,
      message: "Failed to reach Mayar license server",
    });
  }
}
