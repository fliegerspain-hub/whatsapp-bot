import { createClient } from "redis";

let clientPromise;

export function getRedis() {
  if (!clientPromise) {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (err) => console.error("Redis error", err));

    clientPromise = (async () => {
      if (!client.isOpen) await client.connect();
      return client;
    })();
  }
  return clientPromise;
}
