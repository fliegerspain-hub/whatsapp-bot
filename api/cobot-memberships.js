module.exports = async (req, res) => {
  try {
    const base = process.env.COBOT_BASE_URL;
    const token = process.env.COBOT_TOKEN;

    const r = await fetch(`${base}/api/memberships`, {
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
