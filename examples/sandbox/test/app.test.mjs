import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { CONFLUX_ESPACE_MAINNET } from '@conflux-x402/chain-config'
import { createApp } from '../dist/app.js'
import { buildRoutes, toX402RoutesConfig } from '../dist/routes/config.js'

function createConfig(overrides = {}) {
  return {
    port: 4021,
    facilitatorUrl: 'http://localhost:4022',
    evmAddress: '0x1111111111111111111111111111111111111111',
    paymentEnabled: true,
    authMode: 'none',
    rpcUrl: 'https://evm.confluxrpc.com',
    chainId: 1030,
    ...overrides,
  }
}

test('x402 route conversion uses exact scheme with USDT0 asset', () => {
  const config = createConfig()
  const routes = buildRoutes(config)
  const x402Routes = toX402RoutesConfig(routes, config)
  const weatherRoute = x402Routes['GET /sandbox/weather']
  const chartRoute = x402Routes['GET /chart/render']

  assert.ok(weatherRoute)
  assert.ok(chartRoute)
  assert.equal(weatherRoute.accepts[0].scheme, 'exact')
  assert.equal(weatherRoute.accepts[0].price.asset, CONFLUX_ESPACE_MAINNET.token.address)
  assert.equal(weatherRoute.accepts[0].price.amount, '1000')
  assert.equal(chartRoute.accepts[0].price.amount, '1000')
})

test('app registers health and sandbox routes when payment is disabled', () => {
  const app = createApp(createConfig({ paymentEnabled: false }))

  const routeLayers = app._router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }))

  const hasHealth = routeLayers.some((route) => route.path === '/health' && route.methods.includes('get'))
  const hasSandbox = routeLayers.some((route) => route.path === '/sandbox/weather' && route.methods.includes('get'))
  const hasChart = routeLayers.some((route) => route.path === '/chart/render' && route.methods.includes('get'))
  const hasWellKnown = routeLayers.some((route) => route.path === '/.well-known/x402-bazaar.json' && route.methods.includes('get'))

  assert.equal(hasHealth, true)
  assert.equal(hasSandbox, true)
  assert.equal(hasChart, true)
  assert.equal(hasWellKnown, true)
})

test('loadServerConfig reads REFUND_DEFAULT and SERVER_PRIVATE_KEY', async () => {
  // Import dynamically to avoid env pollution; we test the schema shape
  const { loadServerConfig } = await import('../dist/config.js')

  // Set minimal env for parse to work
  process.env.FACILITATOR_URL = 'http://localhost:4022'
  process.env.EVM_ADDRESS = '0x1111111111111111111111111111111111111111'
  process.env.REFUND_DEFAULT = 'on'
  process.env.SERVER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

  const config = loadServerConfig()
  assert.equal(config.refundDefault, 'on')
  assert.equal(config.serverPrivateKey, '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')

  // Cleanup
  delete process.env.REFUND_DEFAULT
  delete process.env.SERVER_PRIVATE_KEY
})

test('buildRoutes includes refund policy when configured', () => {
  const config = createConfig()
  const routes = buildRoutes(config)
  const weather = routes['GET /sandbox/weather']

  assert.ok(weather)
  // After implementation, weather route should have refund config
  assert.ok(weather.refund !== undefined, 'weather route should have refund field')
  assert.equal(weather.refund.enabled, true)
})

test('app creates successfully with refund config', () => {
  const app = createApp(createConfig({
    paymentEnabled: false,
    refundDefault: 'off',
  }))

  // App should create without error with refund system wired in
  assert.ok(app, 'app should exist')
})

test('weather handler sets refund headers when demo_refund query param is set', async () => {
  const app = createApp(createConfig({
    paymentEnabled: false,
    refundDefault: 'off',
  }))

  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, resolve))
  const port = server.address().port

  const res = await fetch(`http://localhost:${port}/sandbox/weather?demo_refund=1`)
  const body = await res.json()

  assert.equal(body.ok, false)
  assert.equal(body.error, 'SIMULATED_FAILURE')
  assert.equal(res.headers.get('x-refund-requested'), '1')
  assert.equal(res.headers.get('x-refund-status'), 'pending')

  server.close()
})
