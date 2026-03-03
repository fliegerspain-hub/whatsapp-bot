import { getRedis } from "./_redis";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "POST only" });

    const redis = await getRedis();
    const body = req.body;

    const msg = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      direction: body.direction,
      from: body.from,
      to: body.to,
      text: body.text,
    };

    await redis.set(`msg:${msg.id}`, JSON.stringify(msg));
    await redis.lPush("messages", msg.id);
    await redis.lTrim("messages", 0, 499);

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
