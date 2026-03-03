import { getRedis } from "./_redis";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const sub = req.body;
    if (!sub?.endpoint) return res.status(400).json({ error: "Invalid subscription" });

    const redis = await getRedis();

    // Store by endpoint (unique)
    const key = `pushsub:${sub.endpoint}`;
    await redis.set(key, JSON.stringify(sub));
    await redis.sAdd("pushsubs", sub.endpoint);

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
