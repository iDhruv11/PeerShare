import { useEffect, useState } from "react";
import { socket } from "./services/socket";
import type { Peer } from "./types";

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
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
