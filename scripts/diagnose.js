// Diagnostic: connect to ATEM and print every state change path + raw packets.
// Usage: node scripts/diagnose.js [ip] [--raw]
// Then change Webcam Out in ATEM Software Control and watch the output.
const { Atem } = require('atem-connection')

const ip = process.argv.slice(2).find((a) => !a.startsWith('--')) || '192.168.10.240'
const raw = process.argv.includes('--raw')
const atem = new Atem({ debugBuffers: raw })
const ts = () => new Date().toISOString().slice(11, 23)
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)

atem.on('error', (e) => console.log(ts(), 'ERROR', e))
atem.on('connected', () => {
  console.log(ts(), 'CONNECTED', atem.state?.info?.productIdentifier, 'api', atem.state?.info?.apiVersion)
  console.log(ts(), 'auxilliaries:', JSON.stringify(atem.state?.video?.auxilliaries))
  console.log(ts(), 'multiViewers[0].properties:', JSON.stringify(atem.state?.settings?.multiViewers?.[0]?.properties))
  const inputs = atem.state?.inputs ?? {}
  for (const [id, i] of Object.entries(inputs)) {
    console.log(ts(), `input ${id}: ${i?.longName} (ext ${i?.externalPortType}) availability=${i?.sourceAvailability}`)
  }
})
atem.on('disconnected', () => console.log(ts(), 'DISCONNECTED'))
atem.on('stateChanged', (state, paths) => {
  for (const p of paths) console.log(ts(), 'STATE', p, '=', JSON.stringify(get(state, p)))
})
atem.on('receivedCommands', (cmds) => {
  for (const c of cmds) console.log(ts(), 'CMD', c.constructor.name, c.constructor.rawName)
})
if (raw) atem.on('debug', (m) => console.log(ts(), 'RAW', m))

console.log(ts(), 'connecting to', ip)
atem.connect(ip).catch((e) => console.log(ts(), 'connect failed', e))
process.on('SIGINT', () => atem.disconnect().finally(() => process.exit(0)))
