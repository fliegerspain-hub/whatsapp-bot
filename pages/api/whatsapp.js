import twilio from "twilio";
import getRawBody from "raw-body";
import querystring from "querystring";

// Twilio sends form-encoded. We parse raw body ourselves.
export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const raw = await getRawBody(req);
    const parsed = querystring.parse(raw.toString("utf8"));

    const incomingText = parsed.Body || "";
    const from = parsed.From || "";

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(`✅ Bot connected. You said: "${incomingText}"`);

    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml.toString());
  } catch (err) {
    res.status(500).send("Server error");
  }
}
