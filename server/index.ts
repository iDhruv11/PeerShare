
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(
    `signaling server running on ${PORT}`
  );
});
