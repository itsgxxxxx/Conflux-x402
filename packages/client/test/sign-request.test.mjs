import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCanonicalMessage, ZERO_BODY_HASH } from '../dist/sign-request.js'

test('buildCanonicalMessage: produces deterministic 0x-prefixed 32-byte hash', () => {
  const params = {
    chainId: 1030,
    host: 'localhost:4021',
    method: 'GET',
    path: '/sandbox/weather',
    bodyHash: ZERO_BODY_HASH,
    nonce: 'test-nonce-123',
    expiry: '1707350430',
  }

  const hash1 = buildCanonicalMessage(params)
  const hash2 = buildCanonicalMessage(params)

  assert.equal(hash1, hash2, 'same params produce same hash')
  assert.ok(hash1.startsWith('0x'), 'hash is 0x-prefixed')
  assert.equal(hash1.length, 66, 'hash is 32 bytes (66 hex chars)')
})

test('buildCanonicalMessage: different chainId produces different hash (cross-chain replay protection)', () => {
  const base = {
    chainId: 1030,
    host: 'localhost:4021',
    method: 'GET',
    path: '/sandbox/weather',
    bodyHash: ZERO_BODY_HASH,
    nonce: 'nonce-1',
    expiry: '1707350430',
  }

  const mainnet = buildCanonicalMessage(base)
  const testnet = buildCanonicalMessage({ ...base, chainId: 71 })
  assert.notEqual(mainnet, testnet)
})

test('buildCanonicalMessage: different host produces different hash (cross-domain replay protection)', () => {
  const base = {
    chainId: 1030,
    host: 'good.com',
    method: 'GET',
    path: '/api',
    bodyHash: ZERO_BODY_HASH,
    nonce: 'nonce-1',
    expiry: '1707350430',
  }

  const good = buildCanonicalMessage(base)
  const evil = buildCanonicalMessage({ ...base, host: 'evil.com' })
  assert.notEqual(good, evil)
})

test('buildCanonicalMessage: different nonce produces different hash (replay protection)', () => {
  const base = {
    chainId: 1030,
    host: 'localhost',
    method: 'GET',
    path: '/',
    bodyHash: ZERO_BODY_HASH,
    nonce: 'nonce-a',
    expiry: '1707350430',
  }

  const a = buildCanonicalMessage(base)
  const b = buildCanonicalMessage({ ...base, nonce: 'nonce-b' })
  assert.notEqual(a, b)
})

test('client and server canonical messages match for same inputs', async () => {
  // Import server-side buildCanonicalMessage to verify they produce identical output
  const { buildCanonicalMessage: serverBuild } = await import('../../server/dist/middleware/auth-check.js')

  const params = {
    chainId: 1030,
    host: 'localhost:4021',
    method: 'GET',
    path: '/sandbox/weather',
    bodyHash: ZERO_BODY_HASH,
    nonce: 'cross-check-nonce',
    expiry: '1707350430',
  }

  const clientHash = buildCanonicalMessage(params)
  const serverHash = serverBuild(params)
  assert.equal(clientHash, serverHash, 'client and server must produce identical canonical message')
})
