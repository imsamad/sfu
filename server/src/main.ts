import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
// @ts-ignore
import https from "httpolyglot";
import WebSocket, { WebSocketServer } from "ws";
import { IncomingMessage } from "http";
import { Socket } from "net";

// Setup certs and express
const certDir = path.join(process.cwd(), "certs");
const app = express();

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

// Handle WebSocket upgrade requests
httpServer.on(
  "upgrade",
  (req: IncomingMessage, socket: Socket, head: Buffer) => {
    console.log("1");
    if (req.url === "/ws") {
      console.log("2");
      wss.handleUpgrade(req, socket, head, (ws) => {
        console.log("3");
        wss.emit("connection", ws, req);
      });
    } else {
      console.log("4");
      socket.destroy();
    }
  }
);

// WebSocket connection handler
wss.on("connection", handleWebSocketConnection);

// Start the server
httpServer.listen(4000, () => {
  console.log(`running on 4000`);
});

// Type-safe WebSocket handler
function handleWebSocketConnection(ws: WebSocket, req: IncomingMessage) {
  console.log("Client connected");

  ws.on("message", (message: WebSocket.RawData) => {
    console.log("Received:", message.toString());
    ws.send(`Echo: ${message}`);
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });

  ws.send("Connected to WebSocket server");
}
