import express from "express";

// @ts-ignore
import https from "httpolyglot";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import * as mediasoup from "mediasoup";
import WebSocket from "ws";

import type {
  MediaKind,
  RtpCapabilities,
  RtpCodecCapability,
  RtpParameters,
} from "mediasoup/node/lib/rtpParametersTypes";

import { Socket } from "net";
import { IncomingMessage } from "http";
import {
  DtlsParameters,
  IceCandidate,
  IceParameters,
} from "mediasoup/node/lib/WebRtcTransportTypes";
import { AppData } from "mediasoup/node/lib/types";

dotenv.config();

const app = express();
const wss = new WebSocket.Server({ noServer: true });

const httpsServer = https.createServer(
  {
    key: fs.readFileSync(path.join(process.cwd(), "certs/key.pem")),
    cert: fs.readFileSync(path.join(process.cwd(), "certs/cert.pem")),
  },
  app
);

httpsServer.on(
  "upgrade",
  (req: IncomingMessage, socket: Socket, head: Buffer) => {
    if (req.url === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  }
);

const PORT = process.env.PORT || 4000;

httpsServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startMediasoupWorker();
});

function getMediasoupWorker() {
  return mediasoup.createWorker({
    logLevel: "debug",
    logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
  });
}

const mediaCodecs: RtpCodecCapability[] = [
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
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
];

function startMediasoupWorker() {
  getMediasoupWorker()
    .then((worker) => {
      worker.on("died", () => {
        console.error("Mediasoup worker died, exiting in 2 seconds...");
        setTimeout(() => process.exit(1), 2000);
      });

      console.log("Mediasoup worker created successfully");
      worker
        .createRouter({ mediaCodecs })
        .then((router) => {
          console.log("Mediasoup router created successfully");
          handleWSS(worker, router);
        })
        .catch((error) => {
          console.error("Error creating Mediasoup router:", error);
        });
    })
    .catch((error) => {
      console.error("Error creating Mediasoup worker:", error);
    });
}

type TWsMessage =
  | {
      type: "message";
      data: { message: string };
    }
  | {
      type: "get_rtp_capabilities";
    }
  | {
      type: "reply_get_rtp_capabilities";
      data: {
        rtpCapabilities: mediasoup.types.RtpCapabilities;
      };
    }
  | {
      type: "create_producer_webrtc_tpt";
    }
  | {
      type: "reply_create_producer_webrtc_tpt";
      data: {
        id: string;
        iceParameters: IceParameters;
        iceCandidates: IceCandidate[];
        dtlsParameters: DtlsParameters;
      };
    }
  | {
      type: "connect_producer_tpt";
      data: {
        id: string;
        dtlsParameters: DtlsParameters;
      };
    }
  | {
      type: "produce_producer_tpt";
      data: {
        id: string;
        kind: MediaKind;
        rtpParameters: RtpParameters;
        appData: AppData;
      };
    }
  | {
      type: "reply_produce_producer_tpt";
      data: {
        id: string;
      };
    }
  | {
      type: "consumer_tpt_created";
      data: {
        id: string;
        iceParameters: IceParameters;
        iceCandidates: IceCandidate[];
        dtlsParameters: DtlsParameters;
      };
    }
  | {
      type: "connect_consumer_tpt_created";
      data: {
        dtlsParameters: DtlsParameters;
      };
    }
  | {
      type: "can_consume";
      data: {};
    }
  | {
      type: "start_consuming";

      data: { rtpCapabilities: RtpCapabilities };
    }
  | {
      type: "reply_start_consuming";

      data: {
        id: string;
        producerId: string;
        kind: MediaKind;
        rtpParameters: RtpParameters;
      };
    }
  | {
      type: "resume-consume";
    };

let userMap = new Map<
  WebSocket,
  Partial<{
    producerTransport: mediasoup.types.WebRtcTransport<mediasoup.types.AppData>;
    consumerTransport: mediasoup.types.WebRtcTransport<mediasoup.types.AppData>;
    producer: mediasoup.types.Producer<mediasoup.types.AppData>;
    consumer: mediasoup.types.Consumer<mediasoup.types.AppData>;
  }>
>();

function handleWSS(
  worker: mediasoup.types.Worker<mediasoup.types.AppData>,
  router: mediasoup.types.Router<mediasoup.types.AppData>
) {
  wss.addListener("connection", (ws) => {
    console.log(`Client connected on /ws`);
    userMap.set(ws, {});

    sendWsEvent({
      type: "message",
      data: {
        message: "Connected successfully!",
      },
    });

    function sendWsEvent(msg: TWsMessage, _ws?: WebSocket) {
      if (_ws) return _ws.send(JSON.stringify(msg));
      else return ws.send(JSON.stringify(msg));
    }

    ws.onmessage = async (evt) => {
      const message: TWsMessage = JSON.parse(evt.data.toString());
      let tpt_options = {
        listenIps: [{ ip: "0.0.0.0", announcedIp: "127.0.0.1" }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      };
      console.log(message);
      if (message.type === "get_rtp_capabilities") {
        if (userMap.size > 2) {
          sendWsEvent({ type: "message", data: { message: "not allowed" } });
          userMap.delete(ws);
          ws.close();
          return;
        }

        sendWsEvent({
          type: "reply_get_rtp_capabilities",
          data: {
            rtpCapabilities: router.rtpCapabilities,
          },
        });
      } else if (message.type === "create_producer_webrtc_tpt") {
        let producerTpt = userMap.get(ws)?.producerTransport;

        if (producerTpt) {
          sendWsEvent({
            type: "message",
            data: { message: "Producer tpt not been created!" },
          });
          sendWsEvent({
            type: "reply_create_producer_webrtc_tpt",
            data: {
              id: producerTpt.id,
              iceCandidates: producerTpt.iceCandidates,
              iceParameters: producerTpt.iceParameters,
              dtlsParameters: producerTpt.dtlsParameters,
            },
          });
          return;
        }
        producerTpt = await router.createWebRtcTransport(tpt_options);
        if (!userMap.get(ws)?.producerTransport)
          userMap.set(ws, {
            ...userMap.get(ws),
            producerTransport: producerTpt,
          });

        producerTpt.on("dtlsstatechange", (dtlsState) => {
          if (dtlsState === "closed") {
            producerTpt.close();
          }
        });
        sendWsEvent({
          type: "reply_create_producer_webrtc_tpt",
          data: {
            id: producerTpt.id,
            iceCandidates: producerTpt.iceCandidates,
            iceParameters: producerTpt.iceParameters,
            dtlsParameters: producerTpt.dtlsParameters,
          },
        });
      } else if (message.type === "connect_producer_tpt") {
        let producerTpt = userMap.get(ws)?.producerTransport;

        await producerTpt?.connect({
          dtlsParameters: message.data.dtlsParameters,
        });
      } else if (message.type === "produce_producer_tpt") {
        let producerTpt = userMap.get(ws)?.producerTransport;

        if (!producerTpt) {
          sendWsEvent({
            type: "message",
            data: { message: "Producer tpt not been created!" },
          });
          return;
        }

        const producer = await producerTpt.produce({
          kind: message.data.kind,
          rtpParameters: message.data.rtpParameters,
          appData: message.data.appData,
        });
        userMap.set(ws, { ...userMap.get(ws), producer });
        console.log(
          `producer created with id: ${producer.id} and kind: ${producer.kind}`
        );
        producer.on("transportclose", () => {
          console.log("producer tpt closed");
          producer.close();
        });

        sendWsEvent({
          type: "reply_produce_producer_tpt",
          data: { id: producer.id },
        });
        const consumer_tpt = await router.createWebRtcTransport(tpt_options);

        consumer_tpt.on("dtlsstatechange", (dtlsState) => {
          if (dtlsState === "closed") {
            producerTpt.close();
          }
        });

        sendWsEvent({
          type: "consumer_tpt_created",
          data: {
            id: consumer_tpt.id,
            iceCandidates: consumer_tpt.iceCandidates,
            iceParameters: consumer_tpt.iceParameters,
            dtlsParameters: consumer_tpt.dtlsParameters,
          },
        });
        userMap.set(ws, {
          ...userMap.get(ws),
          consumerTransport: consumer_tpt,
        });

        await new Promise((r) => setTimeout(r, 2000));

        if (userMap.size === 2) {
          for (const [ws] of userMap) {
            sendWsEvent({ type: "can_consume", data: {} }, ws);
          }
        }
      } else if (message.type === "connect_consumer_tpt_created") {
        await userMap.get(ws)?.consumerTransport?.connect({
          dtlsParameters: message.data.dtlsParameters,
        });
      } else if (message.type === "start_consuming") {
        let peer_: WebSocket | null = null;
        for (const [peer_ws, obj] of userMap) {
          if (peer_ws !== ws) {
            peer_ = peer_ws;
          }
        }
        if (peer_) {
          const peer = userMap.get(peer_);
          if (
            router.canConsume({
              producerId: peer!.producer!.id,
              rtpCapabilities: message.data.rtpCapabilities,
            })
          ) {
            const consumer = await userMap.get(ws)?.consumerTransport!.consume({
              producerId: peer!.producer!.id,
              rtpCapabilities: message.data.rtpCapabilities,
              paused: true,
            });

            consumer!.on("transportclose", () => {
              console.log("tpt close from consumer: ", consumer!.id);
            });
            consumer!.on("producerclose", () => {
              console.log("producer tpt close: ", consumer!.id);
            });
            const params = {
              id: consumer!.id,
              producerId: peer!.producer!.id,
              kind: consumer!.kind,
              rtpParameters: consumer!.rtpParameters,
            };

            sendWsEvent({ type: "reply_start_consuming", data: params });
          }
        }
      } else if (message.type === "resume-consume") {
        await userMap.get(ws)?.consumer?.resume();
      }
    };

    ws.on("close", () => {
      console.log(`Client closed!`);
      userMap.get(ws)?.producer?.close();
      userMap.get(ws)?.producerTransport?.close();
      userMap.get(ws)?.consumer?.close();
      userMap.get(ws)?.consumerTransport?.close();

      userMap.delete(ws);
    });
  });
}
