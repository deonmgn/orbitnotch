const PRODUCT_ID = "4f55cbe6-1793-4119-b698-ace4bd335690";
const MAYAR_VERIFY_URL = "https://api.mayar.id/software/v1/license/verify";

interface VercelRequest {
  method?: string;
  body?: { licenseCode?: string } | string;
}

interface VercelResponse {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => { json: (data: unknown) => void; end: () => void };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ valid: false, message: "Method not allowed" });
  }

  const apiKey = process.env.MAYAR_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      valid: false,
      message: "MAYAR_API_KEY is not configured on Vercel yet.",
    });
  }

  const parsedBody =
    typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const licenseCode = (parsedBody.licenseCode ?? "").trim();

  if (!licenseCode) {
    return res.status(400).json({ valid: false, message: "License code is required" });
  }

  try {
    const upstream = await fetch(MAYAR_VERIFY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        licenseCode,
        productId: PRODUCT_ID,
      }),
    });

    const data = await upstream.json();
    const isValid =
      upstream.ok &&
      (data?.isLicenseActive === true ||
        data?.data?.isLicenseActive === true ||
        data?.statusCode === 200 ||
        data?.valid === true);

    return res.status(isValid ? 200 : 400).json({
      valid: Boolean(isValid),
      message: data?.messages || data?.message || (isValid ? "License verified" : "Invalid license key"),
      data: data?.data ?? null,
    });
  } catch {
    return res.status(502).json({
      valid: false,
      message: "Failed to reach Mayar license server",
    });
  }
}
