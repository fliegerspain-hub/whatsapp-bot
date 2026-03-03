import twilio from "twilio";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).send("OK - send POST from Twilio");
    return;
  }

  // Twilio sends x-www-form-urlencoded
  const bodyText = await new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });

  const params = new URLSearchParams(bodyText);
  const incomingText = params.get("Body") || "";

  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(`✅ Bot connected. You said: "${incomingText}"`);

  res.setHeader("Content-Type", "text/xml");
  res.status(200).send(twiml.toString());
}
