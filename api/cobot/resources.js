module.exports = async (req, res) => {
  try {
    const base = process.env.COBOT_BASE_URL; // https://coworspace-madrid.cobot.me
    const token = process.env.COBOT_TOKEN;

    if (!base || !token) {
      return res.status(500).json({ error: "Missing COBOT_BASE_URL or COBOT_TOKEN" });
    }

    // optional: basic protection so random people can't call your endpoint
    const adminKey = process.env.ADMIN_KEY;
    if (adminKey && req.query.key !== adminKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const r = await fetch(`${base}/api/resources`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const text = await r.text();
    res.status(r.status).send(text);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
