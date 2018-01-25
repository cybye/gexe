/* global namespace in browser */Room = require('ipfs-pubsub-room')
/* global namespace in browser */IPFS = require('ipfs')
/* global namespace in browser */Buffer = require('safe-buffer').Buffer

console.warn("dev mode enabled")
/* global namespace in browser */ipfs = new IPFS({
  repo: String(Math.random() + Date.now()), /* each tab needs its own repo */
  EXPERIMENTAL: {
    pubsub: true
  },
  config: {
    Addresses: {
      Swarm: [
        '/ip4/127.0.0.1/tcp/9090/ws/p2p-webrtc-star'
        // global '/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star'
      ]
    },
    Bootstrap: [
     //   '/ip4/127.0.0.1/tcp/4001/ipfs/Qmd1PtJxiUYwtHeKDv94xx7dnR7bQH7Cc8uPyMcBxk2Ard'
    ]
}
})

