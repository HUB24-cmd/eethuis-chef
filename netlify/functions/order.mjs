import crypto from "node:crypto";
import { json, fail, loadShop, loadMenu, saveOrder, bk, tokenFor, cfg, nowNL, eur } from "../lib/shop.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail(405, "Alleen POST.");
  let inp; try { inp = await req.json(); } catch { return fail(400, "Ongeldige bestelling."); }
  if (!inp || typeof inp !== "object") return fail(400, "Ongeldige bestelling.");
  if (inp.hp) return fail(400, "Ongeldige bestelling.");
  const S = await loadShop(req.url), menu = await loadMenu(req.url);
  if ((S.pickup?.payment ?? "online") !== "online" && inp.mode !== "delivery") return fail(400, "Online betalen staat nog niet aan.");

  const mode = inp.mode === "delivery" ? "delivery" : "pickup";
  if (mode === "pickup" && !S.pickup?.enabled) return fail(400, "Afhalen is niet beschikbaar.");
  if (mode === "delivery" && !(S.delivery?.enabled && S.delivery.mode === "own")) return fail(400, "Bezorgen bestel je via Thuisbezorgd.");
  if (!inp.terms) return fail(400, "Ga akkoord met de voorwaarden.");

  const cu = inp.customer || {}, name = String(cu.name || "").trim(), phone = String(cu.phone || "").trim(), email = String(cu.email || "").trim();
  if (name.length < 2 || name.length > 80) return fail(400, "Vul je naam in.");
  if (phone.replace(/\D/g, "").length < 8 || phone.length > 25) return fail(400, "Vul een geldig telefoonnummer in.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return fail(400, "Vul een geldig e-mailadres in.");
  const note = String(inp.note || "").trim().slice(0, 300);

  // prijzen ALTIJD uit menu.js, nooit uit de browser
  const cart = Array.isArray(inp.cart) ? inp.cart : [];
  if (!cart.length || cart.length > 40) return fail(400, "Je bestelling is leeg.");
  const lines = []; let sub = 0;
  for (const l of cart) {
    const it = menu[String(l?.id)], q = Math.trunc(+l?.q);
    if (!it || !(q >= 1 && q <= 30)) return fail(400, "Een gerecht in je bestelling bestaat niet meer. Ververs de pagina.");
    const sel = [];
    for (let gi = 0; gi < it.opts.length; gi++) {
      const v = String((l.sel || [])[gi] ?? "");
      if (!it.opts[gi].options.includes(v)) return fail(400, `Kies een geldige optie bij ${it.name}.`);
      sel.push(v);
    }
    lines.push({ id: l.id, name: it.name, price: it.price, q, sel }); sub += it.price * q;
  }
  sub = Math.round(sub * 100) / 100;

  let fee = 0, address = null;
  if (mode === "delivery") {
    const d = S.delivery;
    if (sub < +d.minOrder) return fail(400, `Minimaal bestelbedrag is ${eur(+d.minOrder)}.`);
    const a = inp.address || {};
    address = { street: String(a.street || "").trim(), zip: String(a.zip || "").replace(/\s+/g, "").toUpperCase(), city: String(a.city || "").trim() };
    if (address.street.length < 3 || address.street.length > 80 || !/^[1-9][0-9]{3}[A-Z]{2}$/.test(address.zip) || address.city.length < 2 || address.city.length > 60) return fail(400, "Controleer je bezorgadres.");
    if ((d.postcodes || []).length && !d.postcodes.some(p => address.zip.startsWith(String(p)))) return fail(400, "We bezorgen helaas niet op dit adres.");
    address.zip = address.zip.slice(0, 4) + " " + address.zip.slice(4);
    fee = Math.round(+d.fee * 100) / 100;
  }
  const total = Math.round((sub + fee) * 100) / 100;

  // tijd: vandaag, binnen openingstijden, niet eerder dan de bereidingstijd
  const now = nowNL(), h = S.hours[String(now.dow)];
  if (!h) return fail(400, "Vandaag zijn we gesloten.");
  const T = s => +s.split(":")[0] * 60 + +s.split(":")[1], open = T(h[0]), close = T(h[1]);
  const prep = +(mode === "delivery" ? S.delivery.prepMinutes : S.pickup.prepMinutes);
  const f = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const t = String(inp.time || "asap"); let timeLabel;
  if (t === "asap") {
    const tm = Math.max(now.min, open) + prep;
    if (now.min < open || now.min >= close || tm > close) return fail(400, "We kunnen nu geen bestellingen meer aannemen.");
    timeLabel = `${f(tm)} (± ${prep} min)`;
  } else {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return fail(400, "Kies een geldige tijd.");
    const tm = T(t);
    if (tm < open || tm > close || tm < now.min + prep - 2) return fail(400, "Deze tijd is niet beschikbaar. Kies een latere tijd.");
    timeLabel = t;
  }

  const id = cfg.prefix() + crypto.randomBytes(3).toString("hex").toUpperCase();
  const order = { id, status: "pending", createdAt: new Date().toISOString(), mode, lines, subtotal: sub, fee, total,
    customer: { name, phone, email }, address, time: t, timeLabel, note, shopName: S.name, shopAddress: S.address };
  await saveOrder(order);

  const site = (cfg.siteUrl() || new URL(req.url).origin).replace(/\/$/, ""), tk = tokenFor(id);
  const ret = r => `${site}/?betaling=${r}&order=${id}&t=${tk}`;
  const body = { Currency: "EUR", AmountDebit: total, Invoice: id, Description: `Bestelling ${id} ${S.name}`,
    ReturnURL: ret("ok"), ReturnURLCancel: ret("geannuleerd"), ReturnURLError: ret("mislukt"), ReturnURLReject: ret("geweigerd"),
    PushURL: site + "/api/push", PushURLFailure: site + "/api/push",
    ClientIP: { Type: 0, Address: req.headers.get("x-nf-client-connection-ip") || "127.0.0.1" } };
  const methods = cfg.methods();
  if (methods.length === 1) body.Services = { ServiceList: [{ Name: methods[0], Action: "Pay" }] };
  else { body.ServicesSelectableByClient = methods.join(","); body.ContinueOnIncomplete = "RedirectToHTML"; }

  let r; try { r = await bk("POST", "/json/Transaction", body); } catch (e) { console.log("BK fout", e.message); r = { status: 0 }; }
  const url = r.data?.RequiredAction?.RedirectURL;
  if (r.status >= 300 || !url) { order.status = "error"; await saveOrder(order); return fail(502, "Online betalen is op dit moment niet beschikbaar. Probeer het later opnieuw."); }
  order.transactionKey = r.data.Key; await saveOrder(order);
  return json({ redirectUrl: url, id });
};
export const config = { path: "/api/order" };
