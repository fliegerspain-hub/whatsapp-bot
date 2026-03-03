import twilio from "twilio";
import OpenAI from "openai";
import { getRedis } from "./_redis";

function readRawBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

// ---- Cobot config ----
const DEFAULT_RESOURCE_ID = "4782de63009254cf8e77d4082e43fd83";
const FALLBACK_MEMBERSHIP_ID = "9aebe8581ef133fa7aa3d48346665687";

// ---------- helpers ----------
function parseTimeRange(text) {
  const m = text.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!m) return null;
  return { start: m[1], end: m[2] };
}

function parseDateToken(text) {
  const iso = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return { kind: "iso", value: iso[1] };
  const t = text.toLowerCase();
  if (t.includes("tomorrow")) return { kind: "rel", value: "tomorrow" };
  if (t.includes("today")) return { kind: "rel", value: "today" };
  return null;
}

function ymdInMadrid(dateObj) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dateObj);
}

function resolveDateYYYYMMDD(dateToken) {
  if (!dateToken) return null;
  if (dateToken.kind === "iso") return dateToken.value;

  const today = ymdInMadrid(new Date());
  if (dateToken.value === "today") return today;

  if (dateToken.value === "tomorrow") {
    const [y, m, d] = today.split("-").map(Number);
    const tomorrowNoonUTC = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
    return ymdInMadrid(tomorrowNoonUTC);
  }
  return null;
}

// DST-safe offset formatting for Europe/Madrid -> +0100/+0200
function getTimeZoneOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return (asUTC - date.getTime()) / 60000;
}

function formatOffset(minutes) {
  const sign = minutes <= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}${mm}`;
}

function madridDateTimeToCobotString(yyyyMMdd, hhmm) {
  const [y, m, d] = yyyyMMdd.split("-").map(Number);
  const [H, M] = hhmm.split(":").map(Number);

  let utcGuess = Date.UTC(y, m - 1, d, H, M, 0);
  let date = new Date(utcGuess);

  let off1 = getTimeZoneOffsetMinutes(date, "Europe/Madrid");
  let utcAdjusted = Date.UTC(y, m - 1, d, H, M, 0) - off1 * 60000;
  date = new Date(utcAdjusted);

  let off2 = getTimeZoneOffsetMinutes(date, "Europe/Madrid");
  if (off2 !== off1) {
    utcAdjusted = Date.UTC(y, m - 1, d, H, M, 0) - off2 * 60000;
    date = new Date(utcAdjusted);
  }

  const offsetStr = formatOffset(getTimeZoneOffsetMinutes(date, "Europe/Madrid"));

  const YY = String(y).padStart(4, "0");
  const MM = String(m).padStart(2, "0");
  const DD = String(d).padStart(2, "0");
  const HH = String(H).padStart(2, "0");
  const Min = String(M).padStart(2, "0");

  return `${YY}-${MM}-${DD}T${HH}:${Min}:00${offsetStr}`;
}

async function cobotCreateBooking({ resource_id, membership_id, from, to, title }) {
  const base = process.env.COBOT_BASE_URL;
  const token = process.env.COBOT_TOKEN;
  if (!base || !token) throw new Error("Missing COBOT_BASE_URL or COBOT_TOKEN");

  const r = await fetch(`${base}/api/resources/${encodeURIComponent(resource_id)}/bookings`, {
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
      title: title || "WhatsApp booking",
      comments: "",
      units: 1,
    }),
  });

  const text = await r.text();
  return { status: r.status, text };
}

// ---- Direct Redis logging ----
async function logToRedis(msg) {
  try {
    const redis = await getRedis();
    const id = crypto.randomUUID();
    const record = { id, ts: Date.now(), ...msg };

    await redis.set(`msg:${id}`, JSON.stringify(record));
    await redis.lPush("messages", id);
    await redis.lTrim("messages", 0, 499);
  } catch (e) {
    console.error("logToRedis failed:", e);
  }
}

export default async function handler(req, res) {
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    if (req.method !== "POST") {
      res.status(200).send("OK - send POST from Twilio");
      return;
    }

    const bodyText = await readRawBody(req);
    const params = new URLSearchParams(bodyText);

    const incomingText = (params.get("Body") || "").trim();
    const from = (params.get("From") || "").trim();
    const to = (params.get("To") || "").trim();

    // log inbound
    await logToRedis({ direction: "in", from, to, text: incomingText });

    // ---- Booking path ----
    if (/^book\b/i.test(incomingText)) {
      const tr = parseTimeRange(incomingText);
      const dt = parseDateToken(incomingText);
      const ymd = resolveDateYYYYMMDD(dt);

      if (!tr || !ymd) {
        const msg = 'Send: "book YYYY-MM-DD 10:00-11:00" (or "book today 10:00-11:00").';
        twiml.message(msg);
        await logToRedis({ direction: "out", from: to, to: from, text: msg });

        res.setHeader("Content-Type", "text/xml");
        res.status(200).send(twiml.toString());
        return;
      }

      const fromCobot = madridDateTimeToCobotString(ymd, tr.start);
      const toCobot = madridDateTimeToCobotString(ymd, tr.end);

      const result = await cobotCreateBooking({
        resource_id: DEFAULT_RESOURCE_ID,
        membership_id: FALLBACK_MEMBERSHIP_ID,
        from: fromCobot,
        to: toCobot,
        title: `WhatsApp booking (${from || "sandbox"})`,
      });

      const outMsg =
        result.status >= 200 && result.status < 300
          ? `✅ Booked Sala (Miembros): ${ymd} ${tr.start}-${tr.end}`
          : `❌ Cobot error (${result.status}): ${result.text}`;

      twiml.message(outMsg);
      await logToRedis({ direction: "out", from: to, to: from, text: outMsg });

      res.setHeader("Content-Type", "text/xml");
      res.status(200).send(twiml.toString());
      return;
    }

    // ---- Normal chat path ----
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    twiml.message(reply);
    await logToRedis({ direction: "out", from: to, to: from, text: reply });

    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml.toString());
  } catch (err) {
    const msg = "Sorry — I had a technical problem. Please try again in a minute.";
    twiml.message(msg);
    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml.toString());
  }
}
