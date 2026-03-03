import twilio from "twilio";
import { getRedis } from "./_redis";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "POST only" });

    const { to, text } = req.body || {};
    if (!to || !text)
      return res.status(400).json({ error: "Missing to or text" });

    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const message = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to,
      body: text,
    });

    // log outgoing
    const redis = await getRedis();
    const id = crypto.randomUUID();

    const record = {
      id,
      ts: Date.now(),
      direction: "out",
      from: process.env.TWILIO_WHATSAPP_FROM,
      to,
      text,
      meta: { twilioSid: message.sid },
    };

    await redis.set(`msg:${id}`, JSON.stringify(record));
    await redis.lPush("messages", id);
    await redis.lTrim("messages", 0, 499);

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
