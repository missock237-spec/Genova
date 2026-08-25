// ============================================================
// SSE — Événements temps réel pour le Terminal
// ============================================================
//  SÉCURITÉ (hardened) :
//  - Layer 1 (middleware) : admin-only sur /api/terminal/*
//  - Layer 2 (cette route) : applySecurity() → verifySessionCookie(true)
//    vérifie cryptographiquement le cookie Firebase + custom claims.
//  - Le paramètre ?token= historique est ignoré : seule la session Firebase
//    admin permet d'ouvrir un stream SSE.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { applySecurity } from "@/lib/security";

export const dynamic = "force-dynamic";
const clients = new Map<string, ReadableStreamController<Uint8Array>>();

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  // Layer 2 — vérification cryptographique Firebase (server runtime).
  // Le ?token= historique est ignoré — seul un cookie de session Firebase
  // admin valide (signature vérifiée) ouvre un stream.
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    requireRole: "admin",
  });
  if (secError || !auth) {
    return (
      secError ||
      NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 },
      )
    );
  }

  // Identifiant unique de connexion = UID admin + timestamp
  const connectionId = `${auth.userId}:${Date.now()}`;

  const stream = new ReadableStream({
    start(controller) {
      clients.set(connectionId, controller);

      // Envoyer un message de connexion
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode("data: {\"type\":\"connected\",\"message\":\"Terminal temps reel connecte\"}\n\n"));

      // Nettoyer à la déconnexion
      request.signal.addEventListener("abort", () => {
        clients.delete(connectionId);
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
