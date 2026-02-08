import assert from 'node:assert/strict'
import test from 'node:test'
import { NonceStore, buildCanonicalMessage, ZERO_BODY_HASH } from '../dist/middleware/auth-check.js'

// --- NonceStore tests ---

test('NonceStore: has() returns false for unknown nonce', () => {
  const store = new NonceStore(600_000) // long interval so no auto-cleanup during test
  assert.equal(store.has('abc'), false)
  store.destroy()
})

test('NonceStore: add() then has() returns true', () => {
  const store = new NonceStore(600_000)
  store.add('nonce-1', 5000)
  assert.equal(store.has('nonce-1'), true)
  assert.equal(store.size, 1)
  store.destroy()
})

test('NonceStore: expired nonce is treated as unseen', async () => {
  const store = new NonceStore(600_000)
  store.add('expired', 1) // TTL=1ms → expires almost immediately
  await new Promise((r) => setTimeout(r, 5)) // wait for expiry
  assert.equal(store.has('expired'), false)
  store.destroy()
})

test('NonceStore: cleanup removes expired entries', async () => {
  const store = new NonceStore(600_000)
  store.add('fresh', 60_000)
  store.add('stale', 1) // TTL=1ms
  assert.equal(store.size, 2)
  await new Promise((r) => setTimeout(r, 5))
  store.cleanup()
  assert.equal(store.size, 1)
  assert.equal(store.has('fresh'), true)
  store.destroy()
})

// --- buildCanonicalMessage tests ---

test('buildCanonicalMessage: produces deterministic output', () => {
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

  assert.equal(hash1, hash2)
  assert.ok(hash1.startsWith('0x'))
  assert.equal(hash1.length, 66) // 0x + 64 hex chars
})

test('buildCanonicalMessage: different params produce different hashes', () => {
  const base = {
    chainId: 1030,
    host: 'localhost:4021',
    method: 'GET',
    path: '/sandbox/weather',
    bodyHash: ZERO_BODY_HASH,
    nonce: 'nonce-a',
    expiry: '1707350430',
  }

  const withDifferentChain = buildCanonicalMessage({ ...base, chainId: 71 })
  const withDifferentHost = buildCanonicalMessage({ ...base, host: 'evil.com' })
  const withDifferentPath = buildCanonicalMessage({ ...base, path: '/other' })
  const withDifferentNonce = buildCanonicalMessage({ ...base, nonce: 'nonce-b' })
  const withDifferentExpiry = buildCanonicalMessage({ ...base, expiry: '9999999999' })
  const original = buildCanonicalMessage(base)

  assert.notEqual(original, withDifferentChain, 'chainId changes hash')
  assert.notEqual(original, withDifferentHost, 'host changes hash')
  assert.notEqual(original, withDifferentPath, 'path changes hash')
  assert.notEqual(original, withDifferentNonce, 'nonce changes hash')
  assert.notEqual(original, withDifferentExpiry, 'expiry changes hash')
})

test('buildCanonicalMessage: method is case-sensitive', () => {
  const base = {
    chainId: 1030,
    host: 'localhost',
    method: 'GET',
    path: '/',
    bodyHash: ZERO_BODY_HASH,
    nonce: 'n',
    expiry: '1',
  }

  const get = buildCanonicalMessage(base)
  const post = buildCanonicalMessage({ ...base, method: 'POST' })
  assert.notEqual(get, post)
})
