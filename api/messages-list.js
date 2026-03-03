import { getRedis } from "./_redis";

export default async function handler(req, res) {
  try {
    const redis = await getRedis();

    const ids = await redis.lRange("messages", 0, 49);

    const items = [];
    for (const id of ids) {
      const raw = await redis.get(`msg:${id}`);
      if (raw) items.push(JSON.parse(raw));
    }

    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
