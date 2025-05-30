import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
// @ts-ignore
import https from "httpolyglot";
import WebSocket, { WebSocketServer } from "ws";
import { IncomingMessage } from "http";
import { Socket } from "net";
import { types, createWorker } from "mediasoup";
import cors from "cors";
// Setup certs and express
const certDir = path.join(process.cwd(), "certs");
const app = express();
app.use(cors());

app.get("/", (_req: Request, res: Response) => {
  res.send("ok");
});

// WebSocket server (noServer mode)
const wss = new WebSocketServer({ noServer: true });

// HTTPS + HTTP (httpolyglot)
const httpServer = https.createServer(
  {
    key: fs.readFileSync(path.join(certDir, "key.pem"), "utf-8"),
    cert: fs.readFileSync(path.join(certDir, "cert.pem"), "utf-8"),
  },
  app
);

(async () => {
  let worker = await createWorker_util();

  async function createWorker_util() {
    let worker = await createWorker({
      rtcMinPort: 2000,
      rtcMaxPort: 2020,
    });
    console.log(`worker pid: ${worker.pid}`);

    worker.on("died", (error) => {
      console.error(`mediasoup worker has died: `);
      setTimeout(() => {
        process.exit(1);
      }, 2000);
    });

    return worker;
  }

  const mediaCodecs = [
    {
      kind: "audio",
      mimeType: "audio/opus",
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: "video",
      mimeType: "video/VP8",
      clockRate: 90000,
    },
  ];

  // Handle WebSocket upgrade requests
  httpServer.on(
    "upgrade",
    (req: IncomingMessage, socket: Socket, head: Buffer) => {
      console.log("Upgrade request received");

      if (req.url === "/ws") {
        console.log("WebSocket upgrade requested");
        wss.handleUpgrade(req, socket, head, (ws) => {
          console.log("WebSocket connection established");
          wss.emit("connection", ws, req);
        });
      } else {
        console.log("Non-WebSocket upgrade request, closing socket.");
        socket.destroy();
      }
    }
  );

  // WebSocket connection handler
  wss.on("connection", handleWebSocketConnection);

  // Start the server
  httpServer.listen(4000, () => {
    console.log("Server running on port 4000");
  });

  async function handleWebSocketConnection(
    ws: WebSocket,
    req: IncomingMessage
  ) {
    console.log("Client connected");
    // @ts-ignore
    const router = await worker.createRouter({ mediaCodecs });

    ws.on("message", (message: WebSocket.RawData) => {
      console.log("Received:", message.toString());
      ws.send(`Echo: ${message}`);
    });

    ws.on("close", () => {
      console.log("Client disconnected");
    });

    ws.on("getRtpCapanbilities", () => {
      ws.send(message("RtpCapanbilities", router.rtpCapabilities));
    });

    ws.send("Connected to WebSocket server");
  }
})();

function message(evt: string, message: any) {
  return JSON.stringify({ event: evt, message });
}
