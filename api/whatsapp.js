import twilio from "twilio";
import OpenAI from "openai";

function readRawBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(200).send("OK - send POST from Twilio");
      return;
    }

    const bodyText = await readRawBody(req);
    const params = new URLSearchParams(bodyText);

    const incomingText = params.get("Body") || "";
    const from = params.get("From") || "";

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Keep it simple for now: just answer politely
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful coworking assistant on WhatsApp. Keep replies short and practical. If booking is requested, ask clarifying questions.",
        },
        { role: "user", content: `User (${from}) says: ${incomingText}` },
      ],
      max_tokens: 180,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Sorry, I couldn't generate a reply.";

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);

    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml.toString());
  } catch (err) {
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(
      "Sorry — I had a technical problem. Please try again in a minute."
    );
    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml.toString());
  }
}
