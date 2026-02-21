import { useRef } from "react";

export function useWebRTC() {
  const peerConnection =
    useRef<RTCPeerConnection | null>(
      null
    );

  function createPeerConnection() {
    const pc =
      new RTCPeerConnection({
        iceServers: [
          {
            urls:
              "stun:stun.l.google.com:19302"
          }
        ]
      });
    peerConnection.current = pc;
    return pc;
  }

  return {
    peerConnection,
    createPeerConnection
  };
}
