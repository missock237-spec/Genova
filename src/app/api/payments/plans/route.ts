// ============================================================
// GET /api/payments/plans — Liste des plans d'abonnement
// ============================================================
import { NextResponse } from "next/server";
import { SUBSCRIPTION_PLANS } from "@/lib/sebpay";

// [server-04] Edge runtime — mapping statique, pas de DB
export const runtime = 'edge';
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({
    success: true,
    data: SUBSCRIPTION_PLANS.map((plan) => ({
      id: plan.id,
      name: plan.name,
      price: plan.price,
      priceUSD: plan.priceUSD,
      priceFormatted: plan.price === 0 ? "Gratuit" : `${plan.price.toLocaleString()} FCFA/mois`,
      credits: plan.credits,
      maxAgents: plan.maxAgents === -1 ? "Illimité" : plan.maxAgents,
      maxWorkflows: plan.maxWorkflows === -1 ? "Illimité" : plan.maxWorkflows,
      maxTokensPerMonth: plan.maxTokensPerMonth.toLocaleString(),
      features: plan.features,
      popular: plan.popular ?? false,
    })),
  });
}