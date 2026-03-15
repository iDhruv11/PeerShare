# PeerShare

**Direct peer-to-peer file sharing and messaging—no server storage, no bandwidth bottleneck.**

PeerShare establishes direct browser-to-browser connections using WebRTC Data Channels, enabling real-time file transfer and messaging without any payload ever touching your server. Using STUN-assisted NAT traversal, ICE candidate negotiation, and UDP hole punching, two browsers can discover and communicate with each other directly across the internet—all coordinated by a lightweight signaling server that steps out of the way once the connection is established.

Built on lessons learnt from **[PortShare](https://github.com/iDhruv11/PortShare.git)**, which used a centralized file hosting approach. This version eliminates server-side storage entirely, removes upload/download latency, and scales horizontally since the server only handles peer discovery and session negotiation.

---

## What's New vs v1

| Aspect | v1 | v2 |
|--------|----|----|
| **Architecture** | Centralized file server + temporary local port sharing | Pure P2P—direct browser-to-browser |
| **Data Path** | File → Server → Downloader → Local port | Peer → Peer (direct UDP) |
| **Scalability** | Server RAM = bottleneck | Server load minimal (signaling only) |
| **Latency** | Upload + download + port setup | Direct connection (~100ms for file transfer start) |
| **Capability** | Files only | Files + real-time messaging |

---

## Key Features

- **Peer Discovery** – Real-time availability of connected peers
- **Direct P2P Messaging** – Instant messages routed browser-to-browser
- **Chunked Binary File Transfer** – Large files split and reassembled on-the-fly
- **Transfer Progress Tracking** – Real-time feedback on upload/download status
- **NAT Traversal** – STUN servers + ICE candidates enable connections behind firewalls
- **Connection Resilience** – Automatic fallback and session recovery
- **No Server Storage** – Files never touch the backend

---

## How It Works

1. **Peer Registration** – Browsers connect to signaling server via Socket.IO
2. **Connection Request** – Alice selects Bob; server forwards request
3. **SDP Offer/Answer** – Alice and Bob exchange WebRTC session descriptions through server
4. **STUN Discovery** – Both peers query STUN server to learn their public IP:port
5. **ICE Candidates** – Potential network routes exchanged through signaling server
6. **UDP Hole Punching** – Peers send outbound UDP packets; NAT creates bidirectional mapping
7. **Direct Link Established** – WebRTC Data Channel opens; server is no longer in the path
8. **P2P Transfer** – Files and messages flow directly between browsers

The signaling server only participates in steps 1–6. After that, everything is peer-to-peer.

---

## Architecture

```
         +----------------------+
         | Signaling Server     |
         | Node + Socket.IO     |
         +----------+-----------+
                    |
        Offer/Answer + ICE
                    |
      +-------------+-------------+
      |                           |
+-----▼-----+               +-----▼-----+
| Browser A |               | Browser B |
+-----+-----+               +-----+-----+
      |                           |
      |---- STUN Discovery -------|
      |                           |
      +-----------+---------------+
                  |
           Direct WebRTC
          Data Channel
           (UDP P2P)
                  |
      Messages / Files / Binary
```

**Server involvement**: Peer discovery & negotiation only. Zero involvement in file/message transfer.

---

## Technical Highlights

### Networking Deep Dive
- **WebRTC Data Channels** – Reliable, ordered UDP-based communication with automatic retransmission
- **STUN Protocol** – Discover public endpoint behind NAT (RFC 5389)
- **ICE (Interactive Connectivity Establishment)** – Try multiple candidate pairs until one works
- **SDP (Session Description Protocol)** – Describe media capabilities and network endpoints
- **UDP Hole Punching** – Leverage NAT's "permit outbound responses" rule to enable inbound traffic
- **Connection State Management** – Handle peer disconnections, network switches, and reconnection

### File Transfer
- Binary chunking with configurable chunk size (default 16KB)
- Backpressure handling via `bufferedAmount` to prevent memory overflow
- In-memory reassembly with Blob generation
- Support for any file type (PDF, images, archives, etc.)

---

## Tech Stack

### Frontend
- React 18+ with TypeScript
- WebRTC API (native browser)
- Socket.IO Client

### Backend
- Node.js + Express
- Socket.IO for signaling
- STUN integration (public STUN servers)

### Networking Protocols
- WebRTC Data Channels
- ICE / STUN / SDP
- UDP (once peer-to-peer link established)

---

### Usage
1. Open `http://localhost:3000` in two browser windows or tabs
2. Each browser registers with the signaling server
3. Click a peer's name to request a connection
4. Once connected, send messages or drag-and-drop files
5. Transfers happen directly between browsers

---

## What This Project Teaches

Building a P2P system forces you to understand:
- How modern video conferencing (Zoom, Google Meet) establishes direct connections
- How voice/video calling works without centralized media servers
- How multiplayer games sync state across distributed players
- How CDN systems and content distribution networks function
- The fundamental networking concepts behind decentralized applications.

---

## Learning Outcomes

- Hands-on WebRTC implementation and signaling architecture
- NAT traversal and UDP hole punching mechanics
- Binary file chunking and in-memory reassembly
- Connection lifecycle and state synchronization in distributed systems
- Flow control and backpressure handling for real-time data
- Session negotiation using SDP offer/answer model

