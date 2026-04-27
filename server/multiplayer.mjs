import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { WebSocketServer } from "ws";

const port = Number(process.env.PORT ?? 8787);
const root = resolve(process.cwd());
const dist = join(root, "dist");
const players = new Map();

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".glb", "model/gltf-binary"],
  [".fbx", "application/octet-stream"],
  [".mp3", "audio/mpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (requestUrl.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, players: players.size }));
    return;
  }

  const safePath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = resolve(join(dist, safePath));

  if (!filePath.startsWith(dist) || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
});

const wss = new WebSocketServer({ server, path: "/multiplayer" });

function broadcast(payload, except) {
  const message = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (client !== except && client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}

function sendTo(client, payload) {
  if (client.readyState === client.OPEN) {
    client.send(JSON.stringify(payload));
  }
}

function sanitizeState(value) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const position = Array.isArray(value.position) ? value.position : [0, 0, 0];

  return {
    position: [
      Number(position[0]) || 0,
      Number(position[1]) || 0,
      Number(position[2]) || 0,
    ],
    yaw: Number(value.yaw) || 0,
    speed: Number(value.speed) || 0,
    weaponEquipped: Boolean(value.weaponEquipped),
    kills: Math.max(0, Number(value.kills) || 0),
    nickname: sanitizeNickname(value.nickname),
    character: value.character === "shrek" ? "shrek" : "rat",
  };
}

function sanitizeNickname(value) {
  if (typeof value !== "string") {
    return "Player";
  }

  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, 18);
  return cleaned || "Player";
}

let hostId = null;

function updateHost() {
  if (players.size === 0) {
    hostId = null;
    return;
  }
  if (!players.has(hostId)) {
    hostId = players.keys().next().value;
    broadcast({ type: "host_update", hostId });
  }
}

wss.on("connection", (socket) => {
  const id = randomUUID();
  socket.id = id;
  const player = {
    id,
    state: {
      position: [0, 0, 0],
      yaw: 0,
      speed: 0,
      weaponEquipped: true,
      kills: 0,
      nickname: "Player",
      character: "rat",
    },
  };

  players.set(id, player);
  updateHost();

  sendTo(socket, {
    type: "welcome",
    id,
    hostId,
    players: [...players.values()],
  });

  broadcast({ type: "join", player }, socket);

  socket.on("message", (data) => {
    let payload;

    try {
      payload = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (payload?.type === "sync_npcs") {
      if (id !== hostId) return;
      broadcast({ type: "sync_npcs", npcs: payload.npcs }, socket);
      return;
    }

    if (payload?.type === "hit_npc") {
      if (!hostId || id === hostId) return;
      const hostSocket = [...wss.clients].find((c) => c.id === hostId);
      if (hostSocket) {
        sendTo(hostSocket, { type: "hit_npc", playerId: id, npcId: payload.npcId, damage: payload.damage });
      }
      return;
    }

    if (payload?.type !== "state") {
      return;
    }

    const state = sanitizeState(payload.state);

    if (!state) {
      return;
    }

    player.state = state;
    broadcast({ type: "state", id, state }, socket);
  });

  socket.on("close", () => {
    players.delete(id);
    updateHost();
    broadcast({ type: "leave", id });
  });
});

try {
  await readFile(join(dist, "index.html"));
} catch {
  console.warn("dist/index.html not found. Run npm run build before starting multiplayer.");
}

server.listen(port, () => {
  console.log(`Multiplayer server listening on http://localhost:${port}`);
});
