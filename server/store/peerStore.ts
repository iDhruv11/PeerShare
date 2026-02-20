import { Peer } from "../types";

const peers = new Map<string, Peer>();

export function addPeer(peer: Peer) {
  peers.set(peer.id, peer);
}

export function removePeer(id: string) {
  peers.delete(id);
}

export function getPeer(id: string) {
  return peers.get(id);
}

export function getAllPeers() {
  return Array.from(peers.values());
}
