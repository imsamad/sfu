import type {
  AppData,
  DtlsParameters,
  IceCandidate,
  IceParameters,
  MediaKind,
  RtpCapabilities,
  RtpParameters,
} from "mediasoup-client/types";
import { useCallback, useEffect, useRef, useState } from "react";
// first load and display the video data on screen
import * as mediaSoupClient from "mediasoup-client";

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
      data: { rtpCapabilities: RtpCapabilities };
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

const Screen = () => {
  // first get the feed from video source and connecy to video elemtn on screen
  // create mediaDevice with rtpcapabiliteis from mediasoup router
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<WebSocket>(null);

  const mediaDeviceRef = useRef<mediaSoupClient.types.Device>(null);
  const reply_start_consuming_data_ref = useRef<{
    id: string;
    producerId: string;
    kind: MediaKind;
    rtpParameters: RtpParameters;
  }>(null);

  const [producerTpt, setProducerTpt] =
    useState<mediaSoupClient.types.Transport<mediaSoupClient.types.AppData>>();
  const consumerTptRef =
    useRef<mediaSoupClient.types.Transport<mediaSoupClient.types.AppData>>(
      null
    );

  let params: any = {
    encoding: [
      { rid: "r0", maxBitrate: 100000, scalability: "S1T3" },
      { rid: "r1", maxBitrate: 300000, scalability: "S1T3" },
      { rid: "r2", maxBitrate: 900000, scalability: "S1T3" },
    ],
    codecOptions: {
      videoGoogleStartBitrate: 1000,
    },
  };
  const producerTptIdRef = useRef<string>(null);

  function sendWsEvent(msg: TWsMessage) {
    socketRef.current?.send(JSON.stringify(msg));
  }

  function registerWsEvent() {
    if (!socketRef.current) return;
    socketRef.current.onmessage = async (ev) => {
      const message: TWsMessage = JSON.parse(ev.data.toString());
      console.log(message);

      if (message.type === "reply_get_rtp_capabilities") {
        const device = new mediaSoupClient.Device();
        await device.load({
          routerRtpCapabilities: message.data.rtpCapabilities,
        });

        mediaDeviceRef.current = device;
        sendWsEvent({ type: "create_producer_webrtc_tpt" });
      } else if (message.type === "reply_create_producer_webrtc_tpt") {
        const producerTpt = mediaDeviceRef.current!.createSendTransport(
          message.data
        );
        setProducerTpt(producerTpt);
        producerTpt.on("connect", async ({ dtlsParameters }, cb) => {
          sendWsEvent({
            type: "connect_producer_tpt",
            data: { dtlsParameters, id: producerTpt.id },
          });
          cb();
        });
        producerTpt.on("produce", async (params, cb) => {
          const waitForId = async () => {
            while (!producerTptIdRef.current) {
              await new Promise((r) => setTimeout(r, 100));
            }
            cb({ id: producerTptIdRef.current });
          };
          sendWsEvent({
            type: "produce_producer_tpt",
            data: { id: producerTpt.id, ...params },
          });
          waitForId();
          // await new Promise((r) => setTimeout(r, 1000));
          // if (producerTptId) cb({ id: producerTptId });
        });
        const producer = await producerTpt.produce(params);
        producer.on("trackended", () => {
          console.error("produce  track ended");
        });

        producer.on("transportclose", () => {
          console.error("producer tpt closed");
        });
      } else if (message.type === "reply_produce_producer_tpt") {
        producerTptIdRef.current = message.data.id;
      } else if (message.type === "consumer_tpt_created") {
        const consumerTpt = mediaDeviceRef.current?.createRecvTransport(
          message.data
        );
        consumerTptRef.current = consumerTpt!;

        consumerTpt?.on("connect", ({ dtlsParameters }, cb) => {
          sendWsEvent({
            type: "connect_consumer_tpt_created",
            data: { dtlsParameters },
          });
          cb();
        });
      } else if (message.type === "can_consume") {
        sendWsEvent({
          type: "start_consuming",
          data: { rtpCapabilities: mediaDeviceRef.current?.rtpCapabilities! },
        });
        while (!reply_start_consuming_data_ref.current) {
          await new Promise((r) => setTimeout(r, 100));
        }
        console.log(
          consumerTptRef.current,
          "reply_start_consuming_data_ref: ",
          reply_start_consuming_data_ref
        );
        const consumer = await consumerTptRef.current!.consume(
          reply_start_consuming_data_ref.current
        );
        console.log({ consumer });
        if (consumer) {
          const { track } = consumer;
          console.log({ track });
          remoteVideoRef.current!.srcObject = new MediaStream([track]);
          sendWsEvent({ type: "resume-consume" });
        }
      } else if (message.type === "reply_start_consuming") {
        reply_start_consuming_data_ref.current = message.data;
      }
    };
  }

  useEffect(() => {
    socketRef.current = new WebSocket("ws://localhost:4000/ws");
    registerWsEvent();

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        params = { ...params, track: stream.getVideoTracks()[0] };
        if (!localVideoRef.current) return;
        localVideoRef.current.srcObject = stream;
        sendWsEvent({ type: "get_rtp_capabilities" });
        // get router rtp capabilities
      })
      .catch((err) => {
        alert("Please provide access to camera and microphone(optional)");
        console.error(err);
      });
  }, []);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
        }}
      >
        <video
          autoPlay
          ref={localVideoRef}
          style={{
            width: 400,
            height: 400,
            border: "2px solid red",
          }}
        />
        <video
          autoPlay
          ref={remoteVideoRef}
          style={{
            width: 400,
            height: 400,
            border: "2px solid red",
          }}
        />
      </div>
      <h1>Welcome to the Screen Component</h1>
      <p>This is a placeholder for the main content of the screen.</p>
    </div>
  );
};

export { Screen };
