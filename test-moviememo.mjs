#!/usr/bin/env node

/**
 * Basic integration test for MovieMemo server
 * Tests the 3 paid endpoints without actual payment (requires PAYMENT_ENABLED=false)
 */

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:4021'

async function testEndpoint(name, path, body) {
  console.log(`\n🧪 Testing ${name}...`)
  try {
    const response = await fetch(`${SERVER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    console.log(`   Status: ${response.status} ${response.statusText}`)

    if (response.status === 402) {
      console.log(`   ✅ Payment required (expected with PAYMENT_ENABLED=true)`)
      const data = await response.json()
      console.log(`   Payment info:`, JSON.stringify(data, null, 2))
      return true
    }

    if (!response.ok) {
      const text = await response.text()
      console.log(`   ❌ Error: ${text}`)
      return false
    }

    const data = await response.json()
    console.log(`   ✅ Success`)
    console.log(`   Response:`, JSON.stringify(data, null, 2).slice(0, 200) + '...')
    return true
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`)
    return false
  }
}

async function main() {
  console.log('🎬 MovieMemo Integration Test')
  console.log(`Server: ${SERVER_URL}`)

  // Test health endpoint
  console.log(`\n🧪 Testing health endpoint...`)
  try {
    const response = await fetch(`${SERVER_URL}/health`)
    const data = await response.json()
    console.log(`   ✅ Health check passed:`, data)
  } catch (error) {
    console.log(`   ❌ Health check failed: ${error.message}`)
    console.log(`   Make sure the server is running: pnpm dev:moviememo`)
    process.exit(1)
  }

  // Test the 3 paid endpoints
  const tests = [
    {
      name: 'Movie Info',
      path: '/api/movie-info',
      body: { query: 'Inception' },
    },
    {
      name: 'Career Trends',
      path: '/api/career-trends',
      body: { query: 'Christopher Nolan', type: 'director' },
    },
    {
      name: 'Soundtrack',
      path: '/api/soundtrack',
      body: { query: 'Inception' },
    },
  ]

  let passed = 0
  for (const test of tests) {
    if (await testEndpoint(test.name, test.path, test.body)) {
      passed++
    }
  }

  console.log(`\n📊 Results: ${passed}/${tests.length} tests passed`)

  if (passed === tests.length) {
    console.log('✅ All tests passed!')
    process.exit(0)
  } else {
    console.log('❌ Some tests failed')
    process.exit(1)
  }
}

main()
