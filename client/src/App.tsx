import { useEffect, useState, useRef } from "react";
import { socket } from "./services/socket";
import type { Peer } from "./types";
import { useWebRTC } from "./hooks/useWebRTC";
import "./styles.css";

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
  data: number[];
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
  const [transfers, setTransfers] = useState<string[]>([]);
  const [receivedText, setReceivedText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [receivedFileName, setReceivedFileName] = useState("");
  const [sendProgress, setSendProgress] = useState(0);
  const [receiveProgress, setReceiveProgress] = useState(0);
  const activeTransfersRef = useRef<Record<string, { fileName: string; chunks: number[][]; totalChunks: number; }>>({});
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
          channel.onmessage = handleChannelMessage;
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

  function handleChannelMessage(event: MessageEvent) {
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
      if (!transfer) { return }
      transfer.chunks[payload.index] = payload.data;
      const received = transfer.chunks.filter(Boolean).length;
      setReceiveProgress(
        Math.floor(
          (received /
            transfer.totalChunks) *
          100
        )
      );

      if (received === transfer.totalChunks) {
        const flattened = transfer.chunks.flat();
        const bytes = new Uint8Array(flattened);
        const blob = new Blob([bytes]);
        const url = URL.createObjectURL(blob);
        setReceivedFileName(transfer.fileName);
        setDownloadUrl(url);
        setTransfers(prev => [
          `↓ ${transfer.fileName}`,
          ...prev
        ].slice(0, 10)
        );
        delete activeTransfersRef.current[payload.transferId];
      }
    }
  }

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

    channel.onmessage = handleChannelMessage;

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
    const chunkSize = 16000;
    const totalChunks = Math.ceil(text.length / chunkSize);
    for (let i = 0; i < totalChunks; i++) {
      const chunk = text.slice(
        i * chunkSize,
        (i + 1) *
        chunkSize
      );

      const payload: ChannelMessage = {
        type: "chunk",
        index: i,
        total: totalChunks,
        data: chunk
      };

      dataChannel.current.send(
        JSON.stringify(
          payload
        )
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
    setSendProgress(0);
    const buffer = await selectedFile.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunkSize = 16000;
    const totalChunks = Math.ceil(bytes.length / chunkSize);
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
      const chunk = Array.from(
        bytes.slice(
          i * chunkSize,
          (i + 1) *
          chunkSize
        )
      );
      const payload: ChannelMessage = {
        type: "file-chunk",
        transferId,
        index: i,
        total: totalChunks,
        data: chunk
      };

      dataChannel.current.send(
        JSON.stringify(
          payload
        )
      );
      setSendProgress(Math.floor(((i + 1) / totalChunks) * 100));
    }
    console.log(
      "FILE SENT:",
      transferId
    );
    setTransfers(prev => [
      `↑ ${selectedFile.name}`,
      ...prev
    ].slice(0, 10)
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "32px",
        maxWidth: "1400px",
        margin: "0 auto"
      }}
    >

      <div style={{ marginBottom: "24px" }} >
        <h1
          style={{
            fontSize: "56px",
            fontWeight: 800,
            marginBottom: "12px",
            color: "#ffffff",
            letterSpacing: "-2px"
          }}
        >
          PortShare
        </h1>

        <p
          style={{
            color: "#58a6ff",
            fontSize: "18px",
            fontWeight: 500
          }}
        >
          Peer-to-peer file sharing
          over WebRTC
        </p>
        <p
          style={{
            color: "#6e7681",
            fontSize: "14px",
            marginTop: "8px"
          }}
        >
          Direct browser-to-browser
          file sharing
        </p>
      </div>
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
            style={{
              background: "#1f6feb",
              border: "none",
              borderRadius: "10px",
              padding: "10px 18px",
              color: "white",
              fontWeight: 600,
              cursor: "pointer"
            }}
            onClick={registerPeer}
          >
            Join
          </button>
        </div>
      )}

      {registered && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "320px 1fr",
              gap: "20px",
              marginBottom: "20px"
            }}
          >

            <div
              style={{
                background: "#111827",
                border: "1px solid #1f2937",
                borderRadius: "18px",
                padding: "20px"
              }}
            >
              <h3> Your ID </h3>

              <p
                style={{
                  color: "#58a6ff",
                  fontSize: "18px",
                  fontWeight: 500,
                  marginBottom: "16px"
                }}
              >
                {peerId}
              </p>

              <h3> Online Peers </h3>

              {peers
                .filter(peer => peer.id !== peerId)
                .map(peer => (
                  <div
                    key={peer.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: "12px"
                    }}
                  >
                    <div>
                      <span
                        style={{
                          display: "inline-block",
                          width: "8px",
                          height: "8px",
                          borderRadius: "999px",
                          background: "#58a6ff",
                          marginRight: "10px"
                        }}
                      >
                      </span>
                      {peer.id}
                    </div>

                    {connectedPeer === peer.id ? (
                      <span
                        style={{
                          color: "#58a6ff",
                          fontSize: "14px"
                        }}
                      >
                        Connected
                      </span>
                    ) : (
                      <button
                        style={{
                          background: "#1f6feb",
                          border: "none",
                          borderRadius: "10px",
                          padding: "10px 18px",
                          color: "white",
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                        onClick={() => connectToPeer(peer.id)}
                      >
                        Connect
                      </button>
                    )}
                  </div>
                ))}
            </div>

            <div
              style={{
                background: "#111827",
                border: "1px solid #1f2937",
                borderRadius: "18px",
                padding: "20px"
              }}
            >
              <h3> Connection </h3>

              <p> Peer: {" "} {connectedPeer || "-"} </p>

              <p> Status: {" "}
                <span
                  style={{
                    background: "#1f6feb",
                    padding: "2px 10px",
                    borderRadius: "999px",
                    fontSize: "12px"
                  }}
                >
                  Connected
                </span>
              </p>

              <p> ICE: {" "} {iceState} </p>

              <p> Data Channel: {" "}
                <span
                  style={{
                    background: channelState === "open" ? "#1f6feb" : "#f85149",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    fontSize: "12px"
                  }}
                >
                  {channelState}
                </span>
              </p>

            </div>

          </div>

          {
            incomingRequest && connectionState != "connected" && (
              <div
                style={{
                  background:
                    "#1f6feb20",
                  border:
                    "1px solid #1f6feb",
                  borderRadius:
                    "12px",
                  padding: "16px",
                  marginBottom:
                    "20px"
                }}
              >
                <h3> Incoming Request </h3>

                <p> {incomingRequest} {" "} wants to connect </p>
                <div style={{ marginTop: "12px" }} >
                  <button
                    style={{
                      background: "#1f6feb",
                      border: "none",
                      borderRadius: "10px",
                      padding: "10px 18px",
                      color: "white",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                    onClick={acceptRequest}
                  >
                    Accept Request
                  </button>
                </div>
              </div>
            )
          }

          <div
            style={{
              background: "#111827",
              border: "1px solid #1f2937",
              borderRadius: "18px",
              padding: "20px",
              marginBottom: "20px"
            }}
          >
            <h3> Chat </h3>

            <div
              style={{
                maxHeight: "320px",
                overflowY: "auto",
                marginTop: "12px",
                marginBottom: "12px"
              }}
            >
              {messages.map((msg, index) => {
                const isYou = msg.startsWith("You:");
                return (
                  <div
                    key={index}
                    style={{
                      display: "flex",
                      justifyContent: isYou ? "flex-end" : "flex-start",
                      marginBottom: "8px"
                    }}
                  >
                    <div
                      style={{
                        background: isYou ? "#1f6feb" : "#1e293b",
                        padding: "8px 12px",
                        borderRadius: "16px",
                        maxWidth: "70%"
                      }}
                    >
                      {msg.replace("You:", "").replace("Peer:", "")}
                    </div>
                  </div>
                );
              }
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px"
              }}
            >
              <input
                value={message}
                onChange={(e) =>
                  setMessage(e.target.value)
                }
                placeholder="Type message..."
                style={{ flex: 1 }}
              />

              <button
                style={{
                  background: "#1f6feb",
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 18px",
                  color: "white",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
                onClick={sendMessage}> Send </button>
            </div>
          </div>

          <div
            style={{
              background: "#111827",
              border: "1px solid #1f2937",
              borderRadius: "18px",
              padding: "20px"
            }}
          >
            <h3> File Transfer </h3>

            <p> Send Progress: {" "} {sendProgress} % </p>
            <div
              style={{
                height: "8px",
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: "999px",
                overflow: "hidden",
                marginBottom: "12px"
              }}
            >
              <div
                style={{
                  width: `${sendProgress}%`,
                  height: "100%",
                  background: "#1f6feb"
                }}
              />
            </div>

            <p> Receive Progress: {" "} {receiveProgress} % </p>
            <div
              style={{
                height: "8px",
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: "999px",
                overflow: "hidden",
                marginBottom: "12px"
              }}
            >
              <div
                style={{
                  width: `${receiveProgress}%`,
                  height: "100%",
                  background: "#1f6feb"
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
                marginTop: "16px"
              }}
            >
              <input
                type="file"
                style={{
                  flex: 1
                }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) { return }
                  setSelectedFile(file);
                }}
              />
              <button
                style={{
                  background: "#1f6feb",
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 18px",
                  color: "white",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
                onClick={sendFile}> Send File </button>
            </div>

            {downloadUrl && (
              <div
                style={{
                  marginTop: "20px",
                  padding: "16px",
                  background: "#0f172a",
                  border: "1px solid #1e293b",
                  borderRadius: "10px"
                }}
              >
                <p
                  style={{
                    marginBottom: "10px",
                    color: "#58a6ff",
                    fontSize: "18px",
                    fontWeight: 500
                  }}
                >
                  Latest Received File
                </p>

                <p style={{ marginBottom: "12px" }} >
                  📄
                  {" "}
                  {receivedFileName}
                </p>

                <a
                  href={downloadUrl}
                  download={receivedFileName}
                >
                  Download
                </a>
              </div>
            )}
          </div>
          <div
            style={{
              background: "#111827",
              border: "1px solid #1f2937",
              borderRadius: "18px",
              padding: "20px",
              marginTop: "20px"
            }}
          >
            <h3> Recent Transfers </h3>
            <div style={{ marginTop: "12px" }}>
              {transfers.map(
                (item, index) => (
                  <div
                    key={index}
                    style={{ marginBottom: "8px" }}
                  >
                    <div
                      style={{
                        padding: "10px",
                        background: "#0f172a",
                        borderRadius: "10px",
                        marginBottom: "8px"
                      }}
                    >
                      {item}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </>
      )}
    </div >
  );
}

export default App;
