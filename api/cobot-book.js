function readRawBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

module.exports = async (req, res) => {
  try {
    // Allow preflight (helps with browser tools)
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(405).json({ error: "POST only" });
    }

    const base = process.env.COBOT_BASE_URL;
    const token = process.env.COBOT_TOKEN;

    if (!base || !token) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(500).json({ error: "Missing COBOT_BASE_URL or COBOT_TOKEN" });
    }

    // Parse JSON manually (works in Vercel serverless + browser tools)
    const raw = await readRawBody(req);
    const body = raw ? JSON.parse(raw) : {};

    const { resource_id, membership_id, from, to, title, comments } = body;

    if (!resource_id || !membership_id || !from || !to) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(400).json({
        error: "Missing required fields",
        required: ["resource_id", "membership_id", "from", "to"],
        received: body,
      });
    }

    const url = `${base}/api/resources/${encodeURIComponent(resource_id)}/bookings`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        membership_id,
        title: title || "Manual test booking",
        comments: comments || "",
      }),
    });

    const text = await r.text();

    // Return raw so we see exactly what Cobot says
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(r.status).send(text);
  } catch (e) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({ error: String(e) });
  }
};
