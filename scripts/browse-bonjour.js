// Spike: does the ATEM announce itself over Bonjour/mDNS? Run this on the Windows PC while
// the ATEM is connected (once over USB, once over Ethernet) and note whether it shows up.
// Usage: node scripts/browse-bonjour.js [seconds]
const { Bonjour } = require('bonjour-service')

const seconds = Number(process.argv[2]) || 10
const bonjour = new Bonjour()
const found = []

for (const type of ['blackmagic', 'http', 'workstation']) {
  bonjour.find({ type }, (service) => {
    const line = `${type.padEnd(12)} ${service.name} host=${service.host} addresses=${(service.addresses ?? []).join(',')} port=${service.port}`
    found.push(line)
    console.log('FOUND', line)
  })
}

console.log(`browsing for ${seconds}s ...`)
setTimeout(() => {
  bonjour.destroy()
  console.log(found.length ? `\n${found.length} service(s) seen. Look for the ATEM in the list above.` : '\nNothing found.')
  process.exit(0)
}, seconds * 1000)
