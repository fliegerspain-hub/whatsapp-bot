import { createClient } from "redis";

export default async function handler(req, res) {
  let client;
  try {
    if (!process.env.REDIS_URL) {
      return res.status(500).json({ error: "REDIS_URL missing" });
    }

    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (err) => console.error("Redis error", err));

    await client.connect();

    // Write and read a key
    const key = `test:${Date.now()}`;
    await client.set(key, "ok");
    const value = await client.get(key);

    // Write and read a list
    await client.lPush("messages", key);
    const ids = await client.lRange("messages", 0, 5);

    await client.quit();

    return res.status(200).json({
      ok: true,
      wroteKey: key,
      readBack: value,
      listPeek: ids,
    });
  } catch (e) {
    try {
      if (client?.isOpen) await client.quit();
    } catch {}
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
