import { useEffect, useState, useRef } from "react";
import { socket } from "./services/socket";
import type { Peer } from "./types";
import { useWebRTC } from "./hooks/useWebRTC";

type ChannelMessage = {
  type: "chat";
  text: string;
} | {
  type: "chunk";
  index: number;
  total: number;
  data: string;
} | {
  type: "file-meta";
  transferId: string;
  fileName: string;
  totalChunks: number;
} | {
  type: "file-chunk";
  transferId: string;
  index: number;
  total: number;
  data: string;
}

function App() {

  const [peerId, setPeerId] = useState("");
  const peerIdRef = useRef("");
  const incomingRequestRef = useRef("");
  const [registered, setRegistered] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [incomingRequest, setIncomingRequest] = useState("");
  const [connectedPeer, setConnectedPeer] = useState("");
  const connectedPeerRef = useRef("");
  const [connectionState, setConnectionState] = useState("idle");
  const [iceState, setIceState] = useState("waiting");
  const [channelState, setChannelState] = useState("closed");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [receivedText, setReceivedText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [receivedFileName, setReceivedFileName] = useState("");
  const activeTransfersRef = useRef<Record<string, { fileName: string; chunks: string[]; totalChunks: number; }>>({});
  const chunkBufferRef = useRef<string[]>([]);
  const { peerConnection, dataChannel, createPeerConnection } = useWebRTC();

  useEffect(() => {
    socket.on(
      "peer-list",
      (peerList: Peer[]) => {
        setPeers(peerList);
      }
    );

    socket.on(
      "incoming-request",
      ({ from }) => {
        incomingRequestRef.current = from;
        setIncomingRequest(from);
      }
    );

    socket.on(
      "request-accepted",
      async ({ from }) => {
        setConnectedPeer(from);
        connectedPeerRef.current = from;
        await startOffer(from);
      }
    );

    socket.on(
      "offer",
      async ({ offer, from }) => {
        const pc = createPeerConnection();
        pc.ondatachannel = (event) => {
          const channel = event.channel;
          dataChannel.current = channel;
          channel.onopen = () => {
            console.log("DATA CHANNEL OPEN");
            setChannelState("open");
          };
          channel.onclose = () => {
            setChannelState(
              "closed"
            );
          };
          channel.onmessage = (event) => {
            const payload = JSON.parse(event.data) as ChannelMessage;
            if (payload.type === "chat") {
              setMessages(
                prev => [
                  ...prev,
                  `Peer: ${payload.text}`
                ]
              );
              return;
            }
            if (payload.type === "chunk") {
              chunkBufferRef.current[payload.index] = payload.data;
              if (chunkBufferRef.current.filter(Boolean).length === payload.total) {
                const text = chunkBufferRef.current.join("");
                setReceivedText(text);
                console.log(
                  "Reassembled:",
                  text.length
                );
                chunkBufferRef.current = [];
              }
              return;
            }
            if (payload.type === "file-meta") {
              activeTransfersRef.current[payload.transferId] = {
                fileName: payload.fileName,
                chunks: [],
                totalChunks: payload.totalChunks
              };
              return;
            }
            if (payload.type === "file-chunk") {
              const transfer = activeTransfersRef.current[payload.transferId];
              if (!transfer) {
                return;
              }
              transfer.chunks[payload.index] = payload.data;
              const received = transfer.chunks
                .filter(Boolean)
                .length;

              if (received === transfer.totalChunks) {
                const text = transfer.chunks.join("");
                console.log(
                  "FILE COMPLETE:",
                  transfer.fileName,
                  text.length
                );
                const blob = new Blob([text]);
                const url = URL.createObjectURL(blob);
                setReceivedFileName(transfer.fileName);
                setDownloadUrl(url);
                delete activeTransfersRef.current[payload.transferId];
              }
              return;
            }
          };
        };
        pc.oniceconnectionstatechange =
          pc.oniceconnectionstatechange =
          () => {
            console.log(
              "ICE STATE:",
              pc.iceConnectionState
            );
          };
        pc.onconnectionstatechange =
          () => {
            setConnectionState(
              pc.connectionState
            );
          };
        pc.onicecandidate =
          (event) => {
            if (!event.candidate) {
              return;
            }
            socket.emit(
              "ice-candidate",
              {
                to: from,
                candidate:
                  event.candidate
              }
            );
          };
        await pc.setRemoteDescription(
          offer
        );
        const answer =
          await pc.createAnswer();
        await pc.setLocalDescription(
          answer
        );
        socket.emit(
          "answer",
          {
            from: peerIdRef.current,
            to: from,
            answer
          }
        );
      }
    );

    socket.on(
      "answer",
      async ({ answer, from }) => {
        if (!peerConnection.current) {
          return;
        }
        await peerConnection.current
          .setRemoteDescription(
            answer
          );
      }
    );

    socket.on(
      "ice-candidate",
      async (candidate) => {
        if (!peerConnection.current) {
          return;
        }
        try {
          await peerConnection.current
            .addIceCandidate(
              candidate
            );
          setIceState(
            "candidate-added"
          );
        } catch (error) {
          console.error(
            error
          );
        }
      }
    );

    return () => {

      socket.off("peer-list");
      socket.off(
        "incoming-request"
      );
      socket.off(
        "request-accepted"
      );
      socket.off(
        "offer"
      );
      socket.off(
        "answer"
      );
      socket.off(
        "ice-candidate"
      );
    };

  }, []);

  function registerPeer() {
    if (!peerId.trim()) {
      return;
    }
    peerIdRef.current = peerId;
    socket.emit(
      "register-peer",
      peerIdRef.current
    );
    setRegistered(true);
  }

  function connectToPeer(
    targetId: string
  ) {

    socket.emit(
      "connect-request",
      {
        from: peerId,
        to: targetId
      }
    );
  }

  async function startOffer(
    targetId: string
  ) {
    setConnectionState(
      "creating-offer"
    );

    const pc = createPeerConnection();

    const channel =
      pc.createDataChannel(
        "chat"
      );

    dataChannel.current = channel;
    channel.onopen = () => {
      console.log(
        "DATA CHANNEL OPEN"
      );
      setChannelState(
        "open"
      );
    };

    channel.onmessage = (event) => {
      const payload = JSON.parse(event.data) as ChannelMessage;
      if (payload.type === "chat") {
        setMessages(
          prev => [
            ...prev,
            `Peer: ${payload.text}`
          ]
        );
        return;
      }
      if (payload.type === "chunk") {
        chunkBufferRef.current[payload.index] = payload.data;
        if (chunkBufferRef.current.filter(Boolean).length === payload.total) {
          const text = chunkBufferRef.current.join("");
          setReceivedText(text);
          console.log(
            "Reassembled:",
            text.length
          );
          chunkBufferRef.current = [];
        }
        return;
      }
    };

    channel.onclose = () => {
      setChannelState(
        "closed"
      );
    };
    pc.oniceconnectionstatechange =
      () => {
        console.log(
          "ICE STATE:",
          pc.iceConnectionState
        );
      };
    pc.onconnectionstatechange =
      () => {
        setConnectionState(
          pc.connectionState
        );
      };
    pc.onicecandidate =
      (event) => {
        if (!event.candidate) {
          return;
        }
        socket.emit(
          "ice-candidate",
          {
            to: targetId,
            candidate:
              event.candidate
          }
        );
      };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(
      offer
    );

    socket.emit(
      "offer",
      {
        from: peerIdRef.current,
        to: targetId,
        offer
      }
    );
  }

  function acceptRequest() {
    socket.emit(
      "accept-request",
      {
        from: peerId,
        to: incomingRequest
      }
    );
    setConnectedPeer(incomingRequest);
    connectedPeerRef.current = incomingRequest;
  }

  function sendMessage() {
    if (!message.trim()) {
      return;
    }
    if (!dataChannel.current) {
      return;
    }
    const payload: ChannelMessage = {
      type: "chat",
      text: message
    };
    dataChannel.current.send(
      JSON.stringify(payload)
    );
    setMessages(
      prev => [
        ...prev,
        `You: ${message}`
      ]
    );
    setMessage("");
  }

  function generateLargeText() {
    return "A".repeat(
      500_000
    );
  }

  function sendLargeText() {
    if (!dataChannel.current) { return; }
    const text = generateLargeText();
    const chunkSize = 16_000;
    const totalChunks = Math.ceil(
      text.length /
      chunkSize
    );
    for (let i = 0; i < totalChunks; i++) {
      const chunk = text.slice(i * chunkSize, (i + 1) * chunkSize);
      const payload: ChannelMessage = {
        type: "chunk",
        index: i,
        total: totalChunks,
        data: chunk
      };
      dataChannel.current.send(
        JSON.stringify(payload)
      );
    }
    console.log(
      "Sent chunks:",
      totalChunks
    );
  }

  async function sendFile() {
    if (!selectedFile) { return; }
    if (!dataChannel.current) { return; }
    const text = await selectedFile.text();
    const chunkSize = 16000;
    const totalChunks = Math.ceil(
      text.length /
      chunkSize
    );
    const transferId = crypto.randomUUID();
    const meta: ChannelMessage = {
      type: "file-meta",
      transferId,
      fileName: selectedFile.name,
      totalChunks
    };
    console.log(
      "TRANSFER:",
      transferId,
      totalChunks,
      "chunks"
    );
    dataChannel.current.send(
      JSON.stringify(meta)
    );
    for (let i = 0; i < totalChunks; i++) {
      while (dataChannel.current.bufferedAmount > 1_000_000) {
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              10
            )
        );
      }
      const chunk =
        text.slice(
          i * chunkSize,
          (i + 1) *
          chunkSize
        );

      const payload:
        ChannelMessage = {
        type:
          "file-chunk",
        transferId,
        index: i,
        total:
          totalChunks,
        data: chunk
      };

      dataChannel.current.send(
        JSON.stringify(
          payload
        )
      );
    }
    console.log(
      "FILE SENT:",
      transferId
    );
  }

  return (
    <div
      style={{
        padding: "24px"
      }}
    >

      <h1>
        PortShare
      </h1>
      {!registered && (
        <div>
          <input
            value={peerId}
            onChange={(e) =>
              setPeerId(
                e.target.value
              )
            }
            placeholder="Peer ID"
          />
          <button
            onClick={registerPeer}
          >
            Join
          </button>
        </div>
      )}

      {registered && (
        <>
          <h3>
            Your ID: {peerId}
          </h3>
          <hr />
          <h3>
            Online Peers
          </h3>
          {peers
            .filter(
              p => p.id !== peerId
            )
            .map(peer => (
              <div
                key={peer.id}
              >
                {peer.id}
                <button
                  onClick={() =>
                    connectToPeer(
                      peer.id
                    )
                  }
                >
                  Connect
                </button>

              </div>
            ))}

          <hr />

          {incomingRequest && (
            <div
              style={{
                marginTop: "20px"
              }}
            >
              <h3>
                Incoming Request
              </h3>
              <p>
                {incomingRequest}
                {" "}
                wants to connect
              </p>

              <button
                onClick={() =>
                  acceptRequest()
                }
              >
                Accept
              </button>
            </div>
          )}
          <div
            style={{
              marginTop: "20px"
            }}
          >

            <hr />

            <h3> Connection </h3>
            <p> Peer: {" "} {connectedPeer || "-"} </p>
            <p> State: {" "} {connectionState}
            </p>
            <p> ICE: {" "} {iceState}
            </p>
            <p> Data Channel: {" "} {channelState} </p>

            <hr />

            <h3> Chat </h3>
            <input
              value={message}
              onChange={(e) =>
                setMessage(
                  e.target.value
                )
              }
              placeholder="Message"
            />
            <button onClick={sendMessage} > Send </button>
            <button onClick={sendLargeText} > Send 500KB </button>
            <div
              style={{
                marginTop: "10px"
              }}
            >
              {messages.map(
                (msg, index) => (
                  <div
                    key={index}
                  >
                    {msg}
                  </div>
                )
              )}

            </div>

            <hr />

            <h3> Chunk Transfer </h3>
            <p> Received: {" "} {receivedText.length} {" "} chars </p>

            <hr />

            <h3> File Transfer </h3>
            <input
              type="file"
              onChange={(e) => {
                const file =
                  e.target.files?.[0];
                if (!file) {
                  return;
                }
                setSelectedFile(
                  file
                );
              }}
            />
            <button
              onClick={sendFile}
            >
              Send File
            </button>
            {downloadUrl && (
              <div>
                <p>
                  URL:
                  {downloadUrl}
                </p>
                <a
                  href={downloadUrl}
                  download={
                    receivedFileName
                  }
                >
                  Download
                  {" "}
                  {receivedFileName}
                </a>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
