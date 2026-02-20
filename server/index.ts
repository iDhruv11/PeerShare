
import express from "express";
import http from "http";
import { Server } from "socket.io";

import { registerSocketHandlers }
  from "./socket/socketHandler.ts";

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

io.on("connection", socket => {

  console.log(
    "client connected",
    socket.id
  );

  registerSocketHandlers(
    io,
    socket
  );
});

server.listen(3001, () => {
  console.log(
    "signaling server running on 3001"
  );
});
