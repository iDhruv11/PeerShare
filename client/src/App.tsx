import { useEffect, useState } from "react";
import { socket } from "./services/socket";
import type { Peer } from "./types";
import {
  useWebRTC
}
  from "./hooks/useWebRTC";

function App() {

  const [peerId, setPeerId] =
    useState("");

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

  const [connectionState,
    setConnectionState] =
    useState("idle");

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

        setIncomingRequest(from);
      }
    );

    socket.on(
      "request-accepted",
      async ({ from }) => {
        setConnectedPeer(from);
        await startOffer(from);
      }
    );

    socket.on(
      "offer",
      async (offer) => {
        const pc =
          createPeerConnection();
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
            to: incomingRequest,
            answer
          }
        );
      }
    );

    socket.on(
      "answer",
      async (answer) => {
        if (
          !peerConnection.current
        ) {
          return;
        }

        await peerConnection.current
          .setRemoteDescription(
            answer
          );
      }
    );

    return () => {
      socket.off("peer-list");
      socket.off(
        "incoming-request"
      );
    };

  }, []);

  function registerPeer() {
    if (!peerId.trim()) {
      return;
    }
    socket.emit(
      "register-peer",
      peerId
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
    const pc =
      createPeerConnection();
    const offer =
      await pc.createOffer();
    await pc.setLocalDescription(
      offer
    );

    socket.emit(
      "offer",
      {
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
    setConnectedPeer(
      incomingRequest
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
          </div>
        </>
      )}
    </div>
  );
}

export default App;
