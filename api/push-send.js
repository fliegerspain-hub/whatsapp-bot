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
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    setupWebPush();

    const { title, body, url } = req.body || {};
    const payload = JSON.stringify({
      title: title || "New WhatsApp message",
      body: body || "",
      url: url || "/admin"
    });

    const redis = await getRedis();
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
        // If subscription expired/invalid, remove it
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

    res.status(200).json({ ok: true, sent, removed, total: endpoints.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
