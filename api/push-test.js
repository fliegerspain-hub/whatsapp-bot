export default async function handler(req, res) {
  const base = `https://${req.headers.host}`;
  const r = await fetch(`${base}/api/push-send.js`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Test notification",
      body: "If you see this, push works ✅",
      url: "/admin"
    })
  });

  const txt = await r.text();
  res.status(r.status).send(txt);
}
