module.exports = async (req, res) => {
  try {
    const base = process.env.COBOT_BASE_URL;
    const token = process.env.COBOT_TOKEN;

    const response = await fetch(`${base}/api/resources`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const text = await response.text();
    res.status(response.status).send(text);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
