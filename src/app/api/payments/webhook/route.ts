// ============================================================
// POST /api/payments/webhook — Webhook de paiement unifié
// ============================================================
//  Route unique pour tous les fournisseurs. Le fournisseur est déduit :
//   - en-tête "x-chariow-signature"  -> Chariow
//   - en-tête "x-campay-signature"   -> Campay
//   - en-tête "stripe-signature"     -> Stripe
//   - sinon, paramètre ?provider=  (fallback explicite)
//  Chaque webhook est vérifié (signature HMAC) avant tout effet de bord.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { chariow } from "@/lib/payment/chariow";
import { campay } from "@/lib/payment/campay";
import { verifyWebhookSignature } from "@/lib/payment";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function detectProvider(req: NextRequest): string {
  const q = req.nextUrl.searchParams.get("provider");
  if (q) return q;
  if (req.headers.get("x-chariow-signature")) return "chariow";
  if (req.headers.get("x-campay-signature")) return "campay";
  if (req.headers.get("stripe-signature")) return "stripe";
  return "";
}

function getSignature(req: NextRequest, provider: string): string {
  switch (provider) {
    case "campay":
      return req.headers.get("x-campay-signature") ?? "";
    case "stripe":
      return req.headers.get("stripe-signature") ?? "";
    case "chariow":
    default:
      return req.headers.get("x-chariow-signature") ?? req.headers.get("x-signature") ?? "";
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    const payload = JSON.parse(raw);
    const provider = detectProvider(request) || "chariow";
    const signature = getSignature(request, provider);

    if (provider === "stripe") {
      return NextResponse.json({ error: "Webhook Stripe non implémenté" }, { status: 501 });
    }

    const isValid = verifyWebhookSignature(provider as "chariow" | "campay", raw, signature);
    if (!isValid) {
      logger.warn(`webhook_${provider}_invalid_signature`);
      return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
    }

    if (provider === "campay") {
      // Campay traite la confirmation dans son propre endpoint métier ;
      // ici on se contente d'accuser réception après vérification.
      logger.info("campay_webhook_received", { reference: payload.reference, status: payload.status });
      return NextResponse.json({ received: true, provider });
    }

    await chariow.handleWebhook(payload);
    return NextResponse.json({ received: true, provider });
  } catch (error) {
    logger.error("webhook_error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
