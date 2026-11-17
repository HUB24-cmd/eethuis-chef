import { json, fail, loadOrder, tokenOk, settle } from "../lib/shop.mjs";
export default async (req) => {
  const q = new URL(req.url).searchParams, id = q.get("id") || "", t = q.get("t") || "";
  let o = await loadOrder(id);
  if (!o || !tokenOk(id, t)) return fail(404, "Bestelling niet gevonden.");
  o = await settle(o); // push kan nog onderweg zijn: zelf controleren bij Buckaroo
  return json({ status: o.status, mode: o.mode, time: o.timeLabel, id: o.id });
};
export const config = { path: "/api/status" };
