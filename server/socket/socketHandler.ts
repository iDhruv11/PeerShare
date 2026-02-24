import { Server, Socket } from "socket.io";
import {
  addPeer,
  removePeer,
  getAllPeers,
  getPeer
} from "../store/peerStore.ts";

export function registerSocketHandlers(
  io: Server,
  socket: Socket
) {

  socket.on("register-peer", (peerId: string) => {
    addPeer({
      id: peerId,
      socketId: socket.id
    });
    io.emit("peer-list", getAllPeers());
  });

  socket.on(
    "connect-request",
    ({ from, to }) => {
      const target = getPeer(to);
      if (!target) {
        return;
      }
      io.to(target.socketId).emit(
        "incoming-request",
        {
          from
        }
      );
    }
  );

  socket.on("disconnect", () => {
    const peers = getAllPeers();
    const current = peers.find(
      p => p.socketId === socket.id
    );
    if (current) {
      removePeer(current.id);
    }
    io.emit("peer-list", getAllPeers());
  });

  socket.on(
    "accept-request",
    ({ from, to }) => {

      const target = getPeer(to);
      if (!target) {
        return;
      }
      io.to(target.socketId).emit(
        "request-accepted",
        {
          from
        }
      );
    }
  );

  socket.on(
    "offer",
    ({ from, to, offer }) => {
      const target =
        getPeer(to);

      if (!target) {
        return;
      }
      io.to(target.socketId).emit(
        "offer",
        {
          from,
          offer
        }
      );
    }
  );

  socket.on(
    "answer",
    ({ from, to, answer }) => {
      console.log(
        "SERVER ANSWER ROUTE:",
        from,
        "->",
        to
      );
      const target =
        getPeer(to);
      if (!target) {
        return;
      }
      io.to(target.socketId).emit(
        "answer",
        {
          from,
          answer
        }
      );
    }
  );

  socket.on(
    "ice-candidate",
    ({ to, candidate }) => {

      const target = getPeer(to);
      if (!target) {
        return;
      }
      io.to(target.socketId).emit(
        "ice-candidate",
        candidate
      );
    }
  );
}
