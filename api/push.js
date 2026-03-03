import webpush from "web-push";
import { getRedis } from "./_redis";

function setupWebPush() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT;

  if (!pub || !priv || !subj) {
    throw new Error("Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT");
  }
  webpush.setVapidDetails(subj, pub, priv);
}

export default async function handler(req, res) {
  try {
    const action = (req.query?.action || "").toLowerCase();

    // 1) public key for client subscribe()
    if (req.method === "GET" && action === "publickey") {
      return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || "" });
    }

    // Everything below uses webpush
    setupWebPush();

    const redis = await getRedis();

    // 2) subscribe
    if (req.method === "POST" && action === "subscribe") {
      const sub = req.body;
      if (!sub?.endpoint) return res.status(400).json({ error: "Invalid subscription" });

      await redis.set(`pushsub:${sub.endpoint}`, JSON.stringify(sub));
      await redis.sAdd("pushsubs", sub.endpoint);

      return res.status(200).json({ ok: true });
    }

    // 3) send notification to all
    if (req.method === "POST" && action === "send") {
      const { title, body, url } = req.body || {};
      const payload = JSON.stringify({
        title: title || "New WhatsApp message",
        body: body || "",
        url: url || "/admin",
      });

      const endpoints = await redis.sMembers("pushsubs");

      let sent = 0;
      let removed = 0;

      for (const endpoint of endpoints) {
        const raw = await redis.get(`pushsub:${endpoint}`);
        if (!raw) continue;

        const sub = JSON.parse(raw);

        try {
          await webpush.sendNotification(sub, payload);
          sent++;
        } catch (e) {
          const status = e?.statusCode;
          if (status === 404 || status === 410) {
            await redis.del(`pushsub:${endpoint}`);
            await redis.sRem("pushsubs", endpoint);
            removed++;
          } else {
            console.error("push send failed", status, e?.message);
          }
        }
      }

      return res.status(200).json({ ok: true, sent, removed, total: endpoints.length });
    }

    return res.status(400).json({ error: "Unknown action or method" });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
