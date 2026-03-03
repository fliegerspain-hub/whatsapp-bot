import twilio from "twilio";
import { getRedis } from "./_redis";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }

    const { to, text } = req.body || {};
    if (!to || !text) {
      return res.status(400).json({ error: "Missing to or text" });
    }

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return res.status(500).json({ error: "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN" });
    }

    // Default sandbox sender if you didn't set TWILIO_WHATSAPP_FROM
    const fromWa = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    let message;
    try {
      message = await client.messages.create({
        from: fromWa,
        to,
        body: text,
      });
    } catch (e) {
      // Twilio usually includes useful fields in e
      return res.status(500).json({
        error: "Twilio send failed",
        details: {
          message: e?.message,
          code: e?.code,
          moreInfo: e?.moreInfo,
          status: e?.status,
        },
      });
    }

    // log outgoing if Twilio accepted it
    const redis = await getRedis();
    const id = crypto.randomUUID();
    const record = {
      id,
      ts: Date.now(),
      direction: "out",
      from: fromWa,
      to,
      text,
      meta: { twilioSid: message.sid, twilioStatus: message.status },
    };

    await redis.set(`msg:${id}`, JSON.stringify(record));
    await redis.lPush("messages", id);
    await redis.lTrim("messages", 0, 499);

    return res.status(200).json({ ok: true, sid: message.sid, status: message.status });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
