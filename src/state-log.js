// Decides which supervisor states are worth a log line. While the ATEM is being looked for,
// 'searching' and 'connecting' alternate every few seconds; that would flood the log, so they
// count as one situation ('looking').
const GROUP = { searching: 'looking', connecting: 'looking' }

function createStateLogFilter() {
  let last = null
  return ({ state, address, outputWarning }) => {
    const group = GROUP[state]
    const key = group ? `${group}||${outputWarning}` : `${state}|${address ?? ''}|${outputWarning}`
    if (key === last) return false
    last = key
    return true
  }
}

module.exports = { createStateLogFilter }
