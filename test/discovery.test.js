const test = require('node:test')
const assert = require('node:assert/strict')
const { peerAddresses, candidateAddresses } = require('../src/discovery')

const nic = (address, netmask, internal = false) => [{ address, netmask, family: 'IPv4', internal }]

test('peerAddresses: PC .202 on a /30 yields ATEM .201', () => {
  const ifaces = { 'Ethernet 6': nic('172.28.8.202', '255.255.255.252') }
  assert.deepEqual(peerAddresses(ifaces), ['172.28.8.201'])
})

test('peerAddresses: PC .201 on a /30 yields .202', () => {
  const ifaces = { usb: nic('172.28.8.201', '255.255.255.252') }
  assert.deepEqual(peerAddresses(ifaces), ['172.28.8.202'])
})

test('peerAddresses: ignores adapters that are not /30', () => {
  const ifaces = { 'Wi-Fi': nic('192.168.13.44', '255.255.255.0') }
  assert.deepEqual(peerAddresses(ifaces), [])
})

test('peerAddresses: ignores internal adapters even when /30', () => {
  const ifaces = { lo: nic('127.0.0.2', '255.255.255.252', true) }
  assert.deepEqual(peerAddresses(ifaces), [])
})

test('peerAddresses: ignores IPv6 entries', () => {
  const ifaces = { v6: [{ address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', internal: false }] }
  assert.deepEqual(peerAddresses(ifaces), [])
})

test('peerAddresses: network and broadcast addresses have no peer', () => {
  const ifaces = { a: nic('10.0.0.0', '255.255.255.252'), b: nic('10.0.0.3', '255.255.255.252') }
  assert.deepEqual(peerAddresses(ifaces), [])
})

test('peerAddresses: two /30 adapters give two peers (VPN plus USB)', () => {
  const ifaces = {
    vpn: nic('10.8.0.1', '255.255.255.252'),
    usb: nic('172.28.8.202', '255.255.255.252'),
  }
  assert.deepEqual(peerAddresses(ifaces), ['10.8.0.2', '172.28.8.201'])
})

test('peerAddresses: tolerates adapters with undefined address lists', () => {
  assert.deepEqual(peerAddresses({ weird: undefined }), [])
})

test('candidateAddresses: last address first, then usb peers, no duplicates', () => {
  const ifaces = { usb: nic('172.28.8.202', '255.255.255.252') }
  const config = { lastAddress: '172.28.8.201' }
  assert.deepEqual(candidateAddresses({ config, ifaces }), [{ address: '172.28.8.201', via: 'last' }])
})

test('candidateAddresses: with no last address only usb peers are returned', () => {
  const ifaces = { usb: nic('172.28.8.202', '255.255.255.252') }
  assert.deepEqual(candidateAddresses({ config: { lastAddress: null }, ifaces }), [
    { address: '172.28.8.201', via: 'usb' },
  ])
})

test('candidateAddresses: a different last address stays first and usb peers follow', () => {
  const ifaces = { usb: nic('172.28.8.202', '255.255.255.252') }
  assert.deepEqual(candidateAddresses({ config: { lastAddress: '192.168.10.240' }, ifaces }), [
    { address: '192.168.10.240', via: 'last' },
    { address: '172.28.8.201', via: 'usb' },
  ])
})
