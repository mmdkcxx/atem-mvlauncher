const SLASH_30 = '255.255.255.252'

const toOctets = (ip) => ip.split('.').map(Number)
const toInt = (octets) => octets.reduce((n, o) => n * 256 + o, 0)
const fromInt = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')

const isIPv4 = (entry) => entry.family === 'IPv4' || entry.family === 4

// A /30 holds two usable hosts (offset 1 and 2 in the block). The USB-C virtual
// adapter uses one for the PC, so the other one is the ATEM.
function peerAddresses(ifaces) {
  const peers = []
  for (const entries of Object.values(ifaces)) {
    for (const entry of entries ?? []) {
      if (!isIPv4(entry) || entry.internal || entry.netmask !== SLASH_30) continue
      const ip = toInt(toOctets(entry.address))
      const base = Math.floor(ip / 4) * 4
      const offset = ip - base
      if (offset !== 1 && offset !== 2) continue
      peers.push(fromInt(base + (offset === 1 ? 2 : 1)))
    }
  }
  return peers
}

function candidateAddresses({ config, ifaces }) {
  const candidates = []
  const seen = new Set()
  const add = (address, via) => {
    if (!address || seen.has(address)) return
    seen.add(address)
    candidates.push({ address, via })
  }
  add(config.lastAddress, 'last')
  for (const address of peerAddresses(ifaces)) add(address, 'usb')
  return candidates
}

module.exports = { peerAddresses, candidateAddresses }
