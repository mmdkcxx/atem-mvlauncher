const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// app.mjs hides screens with the `hidden` attribute. Author rules such as `.status { display: flex }`
// beat the browser's built-in [hidden] rule, so the stylesheet must restore it.
test('style.css keeps [hidden] elements hidden even when a class sets display', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'style.css'), 'utf8')
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/)
})
