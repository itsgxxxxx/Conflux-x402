import assert from 'node:assert/strict'
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

  assert.ok(weatherRoute)
  assert.equal(weatherRoute.accepts[0].scheme, 'exact')
  assert.equal(weatherRoute.accepts[0].price.asset, CONFLUX_ESPACE_MAINNET.token.address)
  assert.equal(weatherRoute.accepts[0].price.amount, '1000')
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

  assert.equal(hasHealth, true)
  assert.equal(hasSandbox, true)
})
