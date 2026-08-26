import { NextRequest, NextResponse } from "next/server";
import { AGENT_TEMPLATES, getTemplateById, getCategories, getTemplatesByCategory } from "@/lib/templates";

// [server-04] Edge runtime — données statiques uniquement, pas de DB
export const runtime = 'edge';
export const dynamic = "force-dynamic";
export async function GET(request) {
  const s = new URL(request.url).searchParams;
  const id = s.get("id");
  const cat = s.get("category");
  if (id) { const t = getTemplateById(id); return NextResponse.json(t || { error: "not found" }, { status: t ? 200 : 404 }); }
  if (cat) return NextResponse.json({ templates: getTemplatesByCategory(cat) });
  return NextResponse.json({ templates: AGENT_TEMPLATES, categories: getCategories(), count: AGENT_TEMPLATES.length });
}
