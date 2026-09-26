/**
 * POST /api/orders — Dahra Motors 4x4 order notification endpoint.
 *
 * Fires the owner alerts (Email + SMS) SERVER-SIDE and awaits them BEFORE
 * sending the success response back to the client UI, so notifications are
 * guaranteed to trigger before the "Commande enregistrée" confirmation.
 *
 * Email providers (checked in order):
 *   1. Resend      — set RESEND_API_KEY (optional RESEND_FROM)
 *   2. SendGrid    — set SENDGRID_API_KEY (optional SENDGRID_FROM)
 *   3. FormSubmit  — zero-config fallback (no keys required)
 *
 * SMS provider:
 *   Twilio — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER.
 *   Without keys the SMS step is reported as "skipped" (the client also
 *   exposes a pre-filled sms: deep-link to the owner number as backup).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const OWNER_EMAILS = ["dahramotors4x4@gmail.com", "diabissam05@gmail.com"];
const OWNER_PHONE = "+213556400830";

interface OrderPayload {
  reference: string;
  productName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  customerName: string;
  phone: string;
  wilaya: string;
  address: string;
  note?: string;
  channel?: string;
  installation?: { date: string; slot: string } | null;
}

function buildAlert(o: OrderPayload) {
  const total = (o.unitPrice * o.quantity).toLocaleString("fr-DZ");
  const subject = `🛒 Nouvelle commande ${o.reference} — ${o.customerName} (${o.wilaya})`;

  const rows: [string, string][] = [
    ["Référence commande", o.reference],
    ["Nom du client", o.customerName],
    ["Numéro de téléphone", o.phone],
    ["Article commandé", `${o.productName} (${o.sku})`],
    ["Quantité", String(o.quantity)],
    ["Montant total", `${total} DA`],
    ["Wilaya de livraison", o.wilaya],
    ["Adresse de livraison", o.address],
    ["Note client", o.note || "—"],
    [
      "Installation atelier (Baraki)",
      o.installation ? `${o.installation.date} — ${o.installation.slot}` : "Non",
    ],
    ["Canal", o.channel || "COD"],
  ];

  const text = rows.map(([k, v]) => `${k} : ${v}`).join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;background:#0b1120;padding:24px">
      <div style="max-width:600px;margin:auto;background:#121b30;border:1px solid #22304f;border-radius:12px;overflow:hidden">
        <div style="background:#4cc62a;padding:16px 24px">
          <span style="color:#06120a;font-weight:800;font-size:18px;letter-spacing:1px">DAHRA MOTORS 4x4</span>
          <span style="display:block;color:#0a2208;font-size:12px">Nouvelle commande — Ironman 4x4 Algeria</span>
        </div>
        <table style="width:100%;border-collapse:collapse;padding:16px">
          ${rows
            .map(
              ([k, v]) =>
                `<tr><td style="padding:10px 24px;color:#9aa8bf;font-size:13px;border-bottom:1px solid #22304f;width:40%">${k}</td><td style="padding:10px 24px;color:#ffffff;font-size:14px;font-weight:600;border-bottom:1px solid #22304f">${v}</td></tr>`
            )
            .join("")}
        </table>
        <div style="padding:16px 24px;color:#9aa8bf;font-size:12px">
          ⚡ Alerte automatique — contacter le client au <b style="color:#4cc62a">${o.phone}</b> pour vérifier la commande.
        </div>
      </div>
    </div>`;

  return { subject, text, html };
}

async function sendViaResend(subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { provider: "resend", skipped: true };
  const from = process.env.RESEND_FROM || "Dahra Motors 4x4 <onboarding@resend.dev>";
  const results = await Promise.allSettled(
    OWNER_EMAILS.map((to) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, html, text }),
      }).then(async (r) => {
        if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text()}`);
        return r.json();
      })
    )
  );
  return {
    provider: "resend",
    sent: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  };
}

async function sendViaSendGrid(subject: string, html: string, text: string) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return { provider: "sendgrid", skipped: true };
  const from = process.env.SENDGRID_FROM || OWNER_EMAILS[0];
  const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: OWNER_EMAILS.map((email) => ({ email })) }],
      from: { email: from, name: "Dahra Motors 4x4" },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
    }),
  });
  if (!r.ok) throw new Error(`sendgrid ${r.status}: ${await r.text()}`);
  return { provider: "sendgrid", sent: OWNER_EMAILS.length, failed: 0 };
}

async function sendViaFormSubmit(subject: string, text: string, o: OrderPayload) {
  // Zero-config fallback — works without any API keys.
  const results = await Promise.allSettled(
    OWNER_EMAILS.map((email) =>
      fetch(`https://formsubmit.co/ajax/${email}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _subject: subject,
          _template: "table",
          _captcha: "false",
          Référence: o.reference,
          Client: o.customerName,
          Téléphone: o.phone,
          Produit: `${o.productName} (${o.sku})`,
          Quantité: String(o.quantity),
          Total: `${(o.unitPrice * o.quantity).toLocaleString("fr-DZ")} DA`,
          Wilaya: o.wilaya,
          Adresse: o.address,
          Note: o.note || "—",
          "Installation atelier (Baraki)": o.installation
            ? `${o.installation.date} — ${o.installation.slot}`
            : "Non",
          Canal: o.channel || "COD",
        }),
      }).then(async (r) => {
        if (!r.ok) throw new Error(`formsubmit ${r.status}`);
        return r.json();
      })
    )
  );
  return {
    provider: "formsubmit",
    sent: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  };
}

async function sendSmsTwilio(text: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return { provider: "twilio", skipped: true };
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const r = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: OWNER_PHONE, From: from, Body: text }),
    }
  );
  if (!r.ok) throw new Error(`twilio ${r.status}: ${await r.text()}`);
  return { provider: "twilio", sent: 1, failed: 0, to: OWNER_PHONE };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  try {
    const order = (req.body?.order ?? req.body) as OrderPayload;
    if (!order || !order.reference || !order.customerName) {
      return res.status(400).json({ success: false, error: "Invalid order payload" });
    }

    const { subject, text, html } = buildAlert(order);

    // ---- Notifications fire BEFORE the success response (debug requirement) ----
    let email;
    try {
      if (process.env.RESEND_API_KEY) email = await sendViaResend(subject, html, text);
      else if (process.env.SENDGRID_API_KEY) email = await sendViaSendGrid(subject, html, text);
      else email = await sendViaFormSubmit(subject, text, order);
    } catch (err: any) {
      email = { provider: "error", error: String(err?.message ?? err) };
    }

    let sms;
    try {
      sms = await sendSmsTwilio(text);
    } catch (err: any) {
      sms = { provider: "twilio", error: String(err?.message ?? err) };
    }

    console.log("[api/orders] notifications dispatched", {
      reference: order.reference,
      email,
      sms,
    });

    return res.status(200).json({
      success: true,
      notifiedAt: new Date().toISOString(),
      email,
      sms,
    });
  } catch (err: any) {
    console.error("[api/orders] failure", err);
    return res
      .status(500)
      .json({ success: false, error: String(err?.message ?? err) });
  }
}
