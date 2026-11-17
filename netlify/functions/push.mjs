import { loadOrder, settle } from "../lib/shop.mjs";
// Buckaroo-melding. De inhoud wordt NIET vertrouwd: settle() haalt de echte status zelf op.
export default async (req) => {
  let id = "";
  const raw = await req.text();
  try { id = JSON.parse(raw)?.Transaction?.Invoice || ""; } catch { id = new URLSearchParams(raw).get("brq_invoicenumber") || new URLSearchParams(raw).get("BRQ_INVOICENUMBER") || ""; }
  const o = await loadOrder(id);
  if (o) await settle(o);
  return new Response("OK");
};
export const config = { path: "/api/push" };
