import { useEffect, useState, useRef } from "react";
import { socket } from "./services/socket";
import type { Peer } from "./types";
import {
  useWebRTC
}
  from "./hooks/useWebRTC";

function App() {

  const [peerId, setPeerId] =
    useState("");

  const peerIdRef = useRef("");
  const incomingRequestRef = useRef("");

  const [registered, setRegistered] =
    useState(false);

  const [peers, setPeers] =
    useState<Peer[]>([]);

  const [incomingRequest,
    setIncomingRequest] =
    useState("");

  const [connectedPeer,
    setConnectedPeer] =
    useState("");

  const connectedPeerRef = useRef("");

  const [connectionState,
    setConnectionState] =
    useState("idle");

  const [iceState,
    setIceState] =
    useState("waiting");

  const {
    peerConnection,
    createPeerConnection
  } = useWebRTC();

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
        console.log("REQUEST ACCEPTED")
        setConnectedPeer(from);
        connectedPeerRef.current = from;
        await startOffer(from);
      }
    );

    socket.on(
      "offer",
      async ({ offer, from }) => {
        console.log(
          "CURRENT PEER ID:",
          peerIdRef.current
        );
        const pc =
          createPeerConnection();
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
        console.log("remote offer set")
        const answer =
          await pc.createAnswer();
        console.log("answer created")
        await pc.setLocalDescription(
          answer
        );
        console.log("local answer set")
        console.log(
          "SENDING ANSWER TO:",
          incomingRequestRef.current
        );
        console.log(
          "EMITTING ANSWER:",
          peerIdRef.current,
          "->",
          from
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
        console.log(
          "ANSWER RECEIVED FROM:",
          from
        );
        console.log(
          "ANSWER PAYLOAD:",
          answer
        );
        if (!peerConnection.current) {
          return;
        }
        await peerConnection.current
          .setRemoteDescription(
            answer
          );
        console.log(
          "REMOTE ANSWER SET"
        );
      }
    );

    socket.on(
      "ice-candidate",
      async (candidate) => {
        if (
          !peerConnection.current
        ) {
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
    console.log(
      "REGISTERING:",
      peerId
    );
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
    console.log("start ofer")
    setConnectionState(
      "creating-offer"
    );
    const pc = createPeerConnection();
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
    console.log("offer created")
    await pc.setLocalDescription(
      offer
    );
    console.log("local offer set")

    console.log(
      "EMITTING OFFER:",
      peerIdRef.current,
      "->",
      targetId
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

            <h3>
              Connection
            </h3>
            <p>
              Peer:
              {" "}
              {connectedPeer || "-"}
            </p>
            <p>
              State:
              {" "}
              {connectionState}
            </p>
            <p>
              ICE:
              {" "}
              {iceState}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
