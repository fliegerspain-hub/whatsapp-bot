import { getRedis } from "./_redis";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });

    const redis = await getRedis();
    await redis.del(`pushsub:${endpoint}`);
    await redis.sRem("pushsubs", endpoint);

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
