# DNS Verification Guide

## Overview

The identity gating system supports two methods for proving domain ownership:

1. **HTTP Endpoint Verification** (default) - Fast, requires running a web server
2. **DNS TXT Record Verification** (recommended for production) - Industry standard, no server needed

## DNS Verification Method

### How it works

```
1. Request challenge from attestor
2. Add DNS TXT record with challenge code
3. Wait for DNS propagation (few minutes)
4. Request attestation
5. Attestor queries DNS and verifies
6. Get signature and register on-chain
```

### DNS Record Format

```
Name:  _x402-verify.yourdomain.com
Type:  TXT
Value: x402-verify-<hex-string>
```

**Example:**
```
_x402-verify.example.com.  TXT  "x402-verify-a1b2c3d4e5f6..."
```

## Usage

### Using CLI Tool

**HTTP Verification (default):**
```bash
x402-identity register -d example.com
```

**DNS Verification:**
```bash
x402-identity register -d example.com -m dns
```

### Step-by-Step: DNS Verification

1. **Request challenge:**
```bash
cd packages/identity-cli
pnpm build
node dist/cli.js register -d example.com -m dns
```

2. **Add DNS record:**

The CLI will display something like:
```
Name:  _x402-verify.example.com
Type:  TXT
Value: x402-verify-a1b2c3d4e5f6789...
```

Add this to your DNS provider (Cloudflare, AWS Route 53, etc.)

3. **Verify DNS propagation:**

```bash
# Using dig
dig _x402-verify.example.com TXT

# Using nslookup
nslookup -type=TXT _x402-verify.example.com

# Using online tools
# https://dnschecker.org
```

4. **Complete registration:**

Once DNS has propagated, press "yes" in the CLI to continue. The attestor will:
- Query your DNS TXT record
- Verify the challenge matches
- Sign the attestation
- Register your identity on-chain

## Comparison: HTTP vs DNS

| Feature | HTTP Endpoint | DNS TXT Record |
|---------|--------------|----------------|
| **Setup Complexity** | Need web server | Just DNS access |
| **Verification Speed** | Instant | Few minutes (DNS propagation) |
| **Best For** | Development, testing | Production, long-term |
| **Industry Standard** | Less common | Very common (Let's Encrypt, etc.) |
| **Security** | Requires HTTPS | DNS DNSSEC support |

## DNS Provider Examples

### Cloudflare

1. Log into Cloudflare Dashboard
2. Select your domain
3. Go to DNS → Records
4. Click "Add record"
5. Set:
   - Type: `TXT`
   - Name: `_x402-verify`
   - Content: `x402-verify-...` (the challenge code)
   - TTL: Auto or 60 seconds

### AWS Route 53

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "_x402-verify.example.com",
        "Type": "TXT",
        "TTL": 60,
        "ResourceRecords": [{
          "Value": "\"x402-verify-...\""
        }]
      }
    }]
  }'
```

### Namecheap / GoDaddy

1. Log into your domain registrar
2. Find DNS Management or Advanced DNS
3. Add new record:
   - Host: `_x402-verify`
   - Type: `TXT`
   - Value: `x402-verify-...`
   - TTL: 1 min or automatic

## Troubleshooting

### "DNS TXT record not found"

**Cause:** DNS hasn't propagated yet or record is incorrectly configured.

**Solution:**
```bash
# Check if record exists
dig _x402-verify.yourdomain.com TXT

# Expected output:
# _x402-verify.yourdomain.com. 60 IN TXT "x402-verify-..."
```

Wait a few more minutes and try again.

### "Challenge not found in DNS records"

**Cause:** The TXT record value doesn't match the challenge.

**Solution:**
- Ensure you copied the entire challenge code
- Remove any extra quotes (DNS providers auto-add them)
- Check for trailing spaces

### "Challenge expired"

**Cause:** DNS took longer than 5 minutes to propagate.

**Solution:**
- Request a new challenge: `POST /challenge` with `method: "dns"`
- Set lower TTL on your DNS record (60 seconds)
- Some DNS providers have "instant propagation" mode

## API Reference

### Request Challenge (DNS)

```bash
curl -X POST http://localhost:3003/challenge \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0xYourAddress",
    "domain": "example.com",
    "method": "dns"
  }'
```

**Response:**
```json
{
  "challenge": "x402-verify-a1b2c3d4...",
  "address": "0xYourAddress",
  "domain": "example.com",
  "method": "dns",
  "expiresIn": "5 minutes",
  "instructions": "Add a DNS TXT record:\n  Name: _x402-verify.example.com\n  Type: TXT\n  Value: x402-verify-..."
}
```

### Request Attestation (DNS)

```bash
curl -X POST http://localhost:3003/attest \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0xYourAddress",
    "domain": "example.com",
    "method": "dns"
  }'
```

## Implementation Details

### DNS Query

The attestor uses Node.js `dns.promises.resolveTxt()` to query:

```typescript
const records = await dns.resolveTxt(`_x402-verify.${domain}`);
const values = records.flat();

if (values.includes(expectedChallenge)) {
  // Verification successful
}
```

### Alternative: DNS over HTTPS (Future)

For more reliable DNS queries across different network environments, consider using DNS over HTTPS (DoH):

```typescript
// Example using Cloudflare DoH
const response = await fetch(
  `https://cloudflare-dns.com/dns-query?name=_x402-verify.${domain}&type=TXT`,
  { headers: { 'Accept': 'application/dns-json' } }
);
```

This is especially useful for environments with restrictive firewalls.

## Security Considerations

1. **DNS Spoofing**: Use DNSSEC when available
2. **Challenge Expiry**: 5-minute window limits attack surface
3. **Single-Use**: Challenges are deleted after successful verification
4. **TTL Settings**: Low TTL (60s) recommended for faster updates

## Best Practices

1. **Production**: Use DNS verification for permanent identities
2. **Development**: Use HTTP verification for quick testing
3. **DNS TTL**: Set to 60 seconds during registration, increase after
4. **Cleanup**: Remove `_x402-verify` TXT record after successful registration
5. **Monitoring**: Check DNS propagation before confirming in CLI

## FAQ

**Q: Can I use both HTTP and DNS for the same domain?**
A: Yes, but you need to choose one method per registration attempt.

**Q: How long does DNS propagation take?**
A: Usually 1-5 minutes, but can be up to 24 hours depending on TTL and provider.

**Q: Can I reuse the same challenge?**
A: No, challenges are single-use and expire after 5 minutes.

**Q: Do I need to keep the DNS record after registration?**
A: No, you can delete it once identity is registered on-chain.

**Q: What if my DNS provider doesn't support TXT records?**
A: All modern DNS providers support TXT records. If yours doesn't, consider transferring to Cloudflare (free) or AWS Route 53.
