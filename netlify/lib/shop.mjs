// Gedeelde code voor de bestel-functies (Netlify Functions).
// Geheimen staan NIET in de code maar in Netlify > Site configuration > Environment variables.
import crypto from "node:crypto";

const env = (k, d = "") => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? d);

/* ---------- opslag (Netlify Blobs); in tests vervangbaar ---------- */
let store = null;
export function setStore(s) { store = s; }
async function db() {
  if (!store) { const { getStore } = await import("@netlify/blobs"); store = getStore({ name: "orders", consistency: "strong" }); }
  return store;
}
export async function loadOrder(id) { if (!validId(id)) return null; return (await (await db()).get("o/" + id, { type: "json" })) ?? null; }
export async function saveOrder(o) { await (await db()).setJSON("o/" + o.id, o); return o; }
/** true als dit de eerste keer is dat deze sleutel gezet wordt (voorkomt dubbele mails) */
async function claimOnce(key) {
  const s = await db();
  try { const r = await s.set(key, "1", { onlyIfNew: true }); return r?.modified !== false; }
  catch { if (await s.get(key)) return false; await s.set(key, "1"); return true; }
}

/* ---------- menu en instellingen: dezelfde bestanden als de website ---------- */
async function loadJs(base, file, prefix) {
  const r = await fetch(new URL("/" + file, base), { headers: { "cache-control": "no-cache" } });
  if (!r.ok) throw new Error("kan " + file + " niet laden");
  const t = (await r.text()).trim();
  const i = t.indexOf(prefix); // uitleg-commentaar bovenaan het bestand wordt overgeslagen
  if (i < 0) throw new Error(file + " ongeldig");
  return JSON.parse(t.slice(i + prefix.length).replace(/;\s*$/, ""));
}
export async function loadShop(base) { return loadJs(base, "shop.config.js", "window.SHOP="); }
export async function loadMenu(base) {
  const m = {};
  for (const cat of await loadJs(base, "menu.js", "window.MENU_DATA="))
    cat.items.forEach((it, i) => { m[cat.id + "-" + i] = { name: it[0], price: +it[2], opts: (it[3] && it[3].opts) || [] }; });
  return m;
}

/* ---------- hulpjes ---------- */
export const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
export const fail = (status, error) => json({ error }, status);
export const eur = n => "€ " + n.toFixed(2).replace(".", ",");
export const validId = id => /^[A-Z]{1,6}[0-9A-F]{6}$/.test(String(id || ""));
export const tokenFor = id => crypto.createHmac("sha256", env("TOKEN_SECRET")).update(id).digest("hex").slice(0, 24);
export const tokenOk = (id, t) => { const a = Buffer.from(tokenFor(id)), b = Buffer.from(String(t || "")); return a.length === b.length && crypto.timingSafeEqual(a, b); };
export const cfg = { prefix: () => env("ORDER_PREFIX", "CH"), siteUrl: () => env("SITE_URL") || env("URL"), methods: () => env("BUCKAROO_METHODS", "ideal").split(",").map(s => s.trim()).filter(Boolean) };
/** huidige tijd in Nederland */
export function nowNL() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), min: +p.hour * 60 + +p.minute };
}

/* ---------- Buckaroo ---------- */
function bkBase() { return env("BUCKAROO_TEST_BASE") || (env("BUCKAROO_LIVE") === "true" ? "https://checkout.buckaroo.nl" : "https://testcheckout.buckaroo.nl"); }
export async function bk(method, path, body) {
  const base = new URL(bkBase()), key = env("BUCKAROO_WEBSITE_KEY"), secret = env("BUCKAROO_SECRET_KEY");
  if (!key || !secret) throw new Error("Buckaroo-sleutels ontbreken");
  const json = body ? JSON.stringify(body) : "";
  const ts = Math.floor(Date.now() / 1000).toString(), nonce = crypto.randomBytes(8).toString("hex");
  const uri = encodeURIComponent((base.host + path).toLowerCase());
  const bodyHash = json ? crypto.createHash("md5").update(json).digest("base64") : "";
  const sig = crypto.createHmac("sha256", secret).update(key + method.toUpperCase() + uri + ts + nonce + bodyHash).digest("base64");
  const r = await fetch(base.origin + path, { method, body: json || undefined, headers: { authorization: `hmac ${key}:${sig}:${nonce}:${ts}`, "content-type": "application/json", accept: "application/json" } });
  let data = null; try { data = await r.json(); } catch {}
  if (env("DEBUG") === "true") console.log("BK", method, path, r.status, JSON.stringify(data).slice(0, 600));
  return { status: r.status, data };
}
/** echte status bij Buckaroo: 'paid' | 'pending' | 'failed' | 'cancelled' | 'unknown' */
export async function bkStatus(o) {
  if (!o.transactionKey) return "unknown";
  const { status, data: d } = await bk("GET", "/json/Transaction/Status/" + encodeURIComponent(o.transactionKey));
  if (status !== 200 || !d) return "unknown";
  const code = +(d.Status?.Code?.Code ?? 0);
  if (code === 190) {
    if (d.Invoice !== o.id || (d.Currency ?? "EUR") !== "EUR" || Math.abs(+d.AmountDebit - o.total) > 0.001) { console.log("MISMATCH", o.id); return "unknown"; }
    return "paid";
  }
  if ([490, 491, 492, 690].includes(code)) return "failed";
  if ([890, 891].includes(code)) return "cancelled";
  return "pending";
}
export async function settle(o) {
  if (o.status !== "pending") return o;
  const st = await bkStatus(o);
  if (st === "paid") {
    o.status = "paid"; o.paidAt = new Date().toISOString(); await saveOrder(o);
    if (await claimOnce("mail/" + o.id)) await sendMails(o);
  } else if (st === "failed" || st === "cancelled") { o.status = st; await saveOrder(o); }
  return o;
}

/* ---------- e-mail via Resend (resend.com) ---------- */
async function mail(to, subject, text, replyTo) {
  const k = env("RESEND_API_KEY");
  if (!k) { console.log("MAIL (geen RESEND_API_KEY)", to, subject, "\n" + text); return; }
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + k, "content-type": "application/json" },
    body: JSON.stringify({ from: env("MAIL_FROM"), to: [to], subject, text, reply_to: replyTo || undefined }) });
  if (!r.ok) console.log("MAIL FOUT", r.status, await r.text());
}
export function orderText(o) {
  let t = o.lines.map(l => `${l.q}x ${l.name}${l.sel.length ? " (" + l.sel.join(", ") + ")" : ""}  ${eur(l.price * l.q)}`).join("\n");
  t += `\n\nSubtotaal: ${eur(o.subtotal)}\n`; if (o.fee > 0) t += `Bezorgkosten: ${eur(o.fee)}\n`;
  t += `Totaal betaald: ${eur(o.total)}\n\n${o.mode === "delivery" ? "BEZORGEN" : "AFHALEN"} om ${o.timeLabel}\n`;
  if (o.mode === "delivery") t += `Adres: ${o.address.street}, ${o.address.zip} ${o.address.city}\n`;
  if (o.note) t += `Opmerking: ${o.note}\n`;
  return t;
}
async function sendMails(o) {
  const t = orderText(o), c = o.customer;
  await mail(env("MAIL_TO"), `Nieuwe betaalde bestelling ${o.id} · ${o.mode === "delivery" ? "bezorgen" : "afhalen"} ${o.timeLabel}`,
    `Bestelnummer: ${o.id}\nNaam: ${c.name}\nTelefoon: ${c.phone}\nE-mail: ${c.email}\n\n${t}`, c.email);
  await mail(c.email, `Bevestiging van je bestelling ${o.id} bij ${o.shopName}`,
    `Bedankt voor je bestelling bij ${o.shopName}!\n\nBestelnummer: ${o.id}\n\n${t}\n${o.mode === "pickup" ? "Afhalen: " + o.shopAddress + "\n" : ""}`);
}
