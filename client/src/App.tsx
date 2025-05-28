import { useEffect, useRef, useState } from "react";

import mediaSoupClient from "mediasoup-client";

const WebSocketClient = () => {
  const [messages, setMessages] = useState<string[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const myVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const socket = new WebSocket("wss://localhost:4000/ws");
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("Connected to WebSocket server");
      socket.send("Hello from React!");
    };

    socket.onmessage = (event) => {
      setMessages((prev) => [...prev, event.data]);
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
  useEffect(() => {
    (async () => {
      try {
        const mediaStreams = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (!myVideoRef.current) myVideoRef.current = {};
        console.log("1");
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
    </div>
  );
};

export default WebSocketClient;
