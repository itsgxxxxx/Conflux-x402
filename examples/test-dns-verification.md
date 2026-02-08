# Testing DNS Verification Locally

This guide shows how to test DNS verification without actually modifying DNS records.

## Method 1: Mock Mode (Easiest)

Enable mock mode in attestor to skip actual verification:

```bash
# In .env
MOCK_MODE=true

# Start attestor
pnpm dev:attestor

# Register with DNS method (will succeed without DNS record)
cd packages/identity-cli
pnpm build
node dist/cli.js register -d example.com -m dns
```

## Method 2: Local DNS Override (Realistic Testing)

Use `/etc/hosts` or a local DNS server to test DNS queries.

### Using dnsmasq (macOS/Linux)

1. Install dnsmasq:
```bash
# macOS
brew install dnsmasq

# Linux
sudo apt-get install dnsmasq
```

2. Configure test domain:
```bash
# Add to /usr/local/etc/dnsmasq.conf (macOS)
# or /etc/dnsmasq.conf (Linux)
txt-record=_x402-verify.test.local,"x402-verify-YOUR-CHALLENGE-HERE"
```

3. Start dnsmasq:
```bash
sudo brew services start dnsmasq  # macOS
sudo systemctl start dnsmasq      # Linux
```

4. Test:
```bash
dig @127.0.0.1 _x402-verify.test.local TXT

# Should return:
# _x402-verify.test.local. 0 IN TXT "x402-verify-YOUR-CHALLENGE-HERE"
```

5. Use with attestor:
```bash
# Make sure attestor uses local DNS
# In src/verifier.ts, dns.resolveTxt() will use system resolver

node dist/cli.js register -d test.local -m dns
```

## Method 3: Use a Test Domain

If you control a domain with fast DNS propagation:

1. Get challenge:
```bash
curl -X POST http://localhost:3003/challenge \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0xYourAddress",
    "domain": "yourdomain.com",
    "method": "dns"
  }'
```

2. Add TXT record to your actual domain:
```
Name: _x402-verify.yourdomain.com
Type: TXT
Value: x402-verify-<challenge-from-step-1>
TTL: 60 seconds
```

3. Wait ~1 minute, then verify:
```bash
dig _x402-verify.yourdomain.com TXT
```

4. Complete registration:
```bash
node dist/cli.js register -d yourdomain.com -m dns
```

## Method 4: Direct API Testing

Test the DNS verification logic directly:

```typescript
// test-dns.ts
import { DomainVerifier } from '../packages/attestor/src/verifier.js';
import { pino } from 'pino';

const logger = pino();
const verifier = new DomainVerifier(logger, false);

// Generate challenge
const challenge = verifier.generateChallenge(
  '0x1234567890123456789012345678901234567890',
  'example.com',
  'dns'
);

console.log('Challenge:', challenge);
console.log('Add this DNS record:');
console.log(`  _x402-verify.example.com TXT "${challenge}"`);
console.log('\nPress Enter after adding DNS record...');

process.stdin.once('data', async () => {
  const result = await verifier.verifyDomain(
    '0x1234567890123456789012345678901234567890',
    'example.com'
  );

  console.log('Result:', result);
});
```

Run:
```bash
tsx test-dns.ts
```

## Verification Checklist

When testing DNS verification:

- [ ] Challenge is generated correctly
- [ ] Instructions show correct DNS record format
- [ ] DNS query finds the TXT record
- [ ] Challenge value matches exactly
- [ ] Successful verification deletes the challenge
- [ ] Failed verification shows helpful error message
- [ ] Expired challenges (>5 min) are rejected
- [ ] Non-existent records return clear error

## Common Test Scenarios

### Scenario 1: Happy Path
```bash
1. Get challenge with DNS method
2. Add DNS TXT record
3. Wait for propagation
4. Request attestation
5. ✅ Success - signature returned
```

### Scenario 2: Wrong Challenge
```bash
1. Get challenge: x402-verify-abc123
2. Add DNS record with: x402-verify-WRONG
3. Request attestation
4. ❌ Error: "Challenge not found in DNS records"
```

### Scenario 3: DNS Not Propagated
```bash
1. Get challenge
2. Add DNS record (TTL=3600)
3. Immediately request attestation
4. ❌ Error: "DNS TXT record not found"
5. Wait 5 minutes
6. ❌ Error: "Challenge expired"
7. Get new challenge and try again
```

### Scenario 4: No DNS Record
```bash
1. Get challenge
2. Skip adding DNS record
3. Request attestation
4. ❌ Error: "DNS TXT record not found for _x402-verify.example.com"
```

## Debug Commands

Check DNS resolution:
```bash
# Standard query
dig _x402-verify.example.com TXT

# Query specific nameserver
dig @8.8.8.8 _x402-verify.example.com TXT

# Show query time
dig +stats _x402-verify.example.com TXT

# Trace DNS resolution path
dig +trace _x402-verify.example.com TXT
```

Check attestor logs:
```bash
# Run attestor with debug logging
LOG_LEVEL=debug pnpm dev:attestor
```

Test DNS from Node.js:
```javascript
import { promises as dns } from 'dns';

const records = await dns.resolveTxt('_x402-verify.example.com');
console.log('TXT records:', records);
```

## Tips for Fast Testing

1. **Use short TTL**: Set DNS TTL to 60 seconds during testing
2. **Use Cloudflare**: Their DNS propagates very fast (~10 seconds)
3. **Mock mode**: Best for rapid development
4. **Local domain**: Use `.local` domains with dnsmasq
5. **Multiple terminals**: Keep attestor, CLI, and dig running in separate terminals

## Production Testing Checklist

Before deploying to production:

- [ ] Test with actual domain (not mock)
- [ ] Verify DNS propagation time is acceptable
- [ ] Test challenge expiry (wait >5 minutes)
- [ ] Test with DNSSEC-enabled domain
- [ ] Test from different network environments
- [ ] Verify cleanup (challenge deleted after use)
- [ ] Load test with multiple domains
- [ ] Test error scenarios (network issues, DNS timeout)
