import { useEffect, useRef, useState } from "react";

import mediaSoupClient from "mediasoup-client";

const WebSocketClient = () => {
  const [messages, setMessages] = useState<string[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const myVideoRef = useRef<HTMLVideoElement | null>(null);
  const [rtpCapabilities, setRtpCapabilities] = useState();
  useEffect(() => {
    const socket = new WebSocket("ws://localhost:4000/ws");
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("Connected to WebSocket server");
      socket.send("Hello from React!");
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log("message:", message);
      // setMessages((prev) => [...prev, event.data]);
    };

    socket.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    socket.onclose = () => {
      console.log("WebSocket connection closed");
    };

    return () => {
      socket.close();
    };
  }, []);

  function sendEvent(evt: string) {
    socketRef.current?.send(evt);
  }
  useEffect(() => {
    (async () => {
      try {
        const mediaStreams = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        // @ts-ignore
        if (!myVideoRef.current) myVideoRef.current = {};
        console.log("1");
        // @ts-ignore
        myVideoRef.current.srcObject = mediaStreams;
      } catch (error) {
        console.log("error: ", error);
      }
    })();
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">WebSocket Messages</h2>
      <div>
        <video
          ref={myVideoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: 500,
            height: 400,
            border: "2px solid red",
          }}
        />
      </div>
      <div style={{}}>
        <button onClick={() => sendEvent("getRtpCapanbilities")}>
          RTP Capabilities
        </button>
      </div>
    </div>
  );
};

export default WebSocketClient;
