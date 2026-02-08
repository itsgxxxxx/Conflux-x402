# Client Authentication Gating Design

**Date**: 2026-02-08
**Scope**: Hackathon/PoC (2-3 days)
**Goal**: Add identity-based client authentication to x402 payment flow using ZK proofs

## Overview

Add an identity gating layer that requires clients to prove domain ownership before they can make x402 payments. This brings Web2 identity verification on-chain through ZK proofs, creating a compliant payment system.

### Core Principle

**ZK is not proving domain ownership directly**
ZK proves: "I have a valid attestation signature from a trusted verifier, and I haven't tampered with it"

The actual verification (DNS/HTTPS/OAuth) happens in Web2 by the Attestor.

## System Architecture

### Components

1. **IdentityRegistry Contract** (Solidity)
   - On-chain registry mapping `address → Identity`
   - Only writable by ZK Verifier contract
   - Stores: domainHash, issuedAt, expiresAt

2. **ZK Verifier Contract** (Solidity)
   - Verifies ZK proofs using circom-ecdsa
   - Calls IdentityRegistry.register() on success
   - Public inputs: userAddress, domainHash, expiry

3. **Attestor Service** (Node.js)
   - Web2 verification via HTTP endpoint check
   - Signs valid claims: `Sign(attestor_sk, hash(user, domainHash, expiry))`
   - Returns signature to user for ZK proof generation

4. **ZK Circuit** (Circom)
   - Uses circom-ecdsa library for ECDSA signature verification
   - Private input: attestor signature
   - Public inputs: userAddress, domainHash, expiry
   - Proves: signature is valid for these public inputs

5. **Facilitator Integration**
   - Checks IdentityRegistry before processing payments
   - Rejects unauthorized clients with 403

## Data Flow

### Registration Phase (One-time)

```
User
  │
  │ ① Claims domain: "I own example.com"
  │
Attestor (Web2)
  │
  │ ② Verifies HTTP endpoint: GET example.com/verify?address=0xUSER
  │    Expected response: challenge code
  │
  │ ③ Generates signature:
  │    sig = Sign(attestor_sk, hash(userAddress, domainHash, expiry))
  │
User
  │
  │ ④ Generates ZK Proof using circom-ecdsa
  │    Private: sig
  │    Public: userAddress, domainHash, expiry
  │
ZK Verifier Contract
  │
  │ ⑤ Verifies proof
  │
IdentityRegistry Contract
  │
  │ ⑥ Writes identity: identities[userAddress] = Identity(...)
```

### Payment Phase (Every x402 request)

```
Client
  │
  │ ① Sends x402 payment request
  │
Facilitator
  │
  │ ② Checks IdentityRegistry.identities[payer]
  │
  ├─ ✅ Valid & not expired → Continue normal x402 flow
  │
  └─ ❌ Invalid/expired → Return 403 Forbidden
```

## Smart Contracts

### IdentityRegistry.sol

```solidity
contract IdentityRegistry {
    struct Identity {
        bytes32 domainHash;
        uint64 issuedAt;
        uint64 expiresAt;
    }

    mapping(address => Identity) public identities;
    address public verifier; // ZK Verifier contract

    modifier onlyVerifier() {
        require(msg.sender == verifier, "not verifier");
        _;
    }

    function register(
        address user,
        bytes32 domainHash,
        uint64 expiry
    ) external onlyVerifier {
        identities[user] = Identity({
            domainHash: domainHash,
            issuedAt: uint64(block.timestamp),
            expiresAt: expiry
        });
    }

    function isValid(address user) external view returns (bool) {
        Identity memory id = identities[user];
        return id.expiresAt > block.timestamp;
    }
}
```

### ZKVerifier.sol

```solidity
contract ZKVerifier {
    IdentityRegistry public registry;

    function verifyAndRegister(
        Proof calldata proof,
        PublicInputs calldata inputs
    ) external {
        require(verifyProof(proof, inputs), "invalid proof");

        registry.register(
            inputs.userAddress,
            inputs.domainHash,
            inputs.expiry
        );
    }

    // Uses circom-ecdsa verifier
    function verifyProof(
        Proof calldata proof,
        PublicInputs calldata inputs
    ) internal view returns (bool);
}
```

## ZK Circuit Design

### Inputs

**Private (witness)**:
- `sig[3]` - Attestor's ECDSA signature (r, s, v)

**Public**:
- `userAddress` - Client Ethereum address
- `domainHash` - keccak256(domain)
- `expiry` - Unix timestamp

### Circuit Logic (Circom)

```circom
include "circom-ecdsa/ecdsa.circom";

template IdentityVerifier() {
    // Private inputs
    signal input sig[3]; // r, s, v

    // Public inputs
    signal input userAddress;
    signal input domainHash;
    signal input expiry;

    // Attestor public key (hardcoded or as input)
    signal input attestorPubKey[2];

    // Compute message hash
    signal msgHash <== hash(userAddress, domainHash, expiry);

    // Verify ECDSA signature
    component verifier = ECDSAVerify();
    verifier.pubKey <== attestorPubKey;
    verifier.msgHash <== msgHash;
    verifier.sig <== sig;

    verifier.out === 1; // Must be valid
}
```

## Attestor Service

### API Endpoints

**POST /attest**
```json
Request:
{
  "address": "0xUSER...",
  "domain": "example.com"
}

Response:
{
  "signature": "0xSIG...",
  "domainHash": "0x123...",
  "expiry": 1740000000,
  "challenge": "verify-12345"
}
```

### Verification Flow

1. Generate random challenge code
2. Store challenge temporarily (in-memory cache)
3. HTTP GET `https://{domain}/verify?address={address}`
4. Expect response body: `verify-12345`
5. If matches → sign and return
6. If fails → return 400

## Facilitator Integration

### Modified Verify Flow

In `packages/facilitator/src/index.ts`:

```typescript
// Before existing verify logic
const isAuthorized = await checkIdentityRegistry(
  paymentDetails.payer
);

if (!isAuthorized) {
  return res.status(403).json({
    error: "Unauthorized: Identity not registered or expired"
  });
}

// Continue with existing x402 verify logic...
```

### Helper Function

```typescript
async function checkIdentityRegistry(
  address: string
): Promise<boolean> {
  const contract = new ethers.Contract(
    IDENTITY_REGISTRY_ADDRESS,
    IDENTITY_REGISTRY_ABI,
    provider
  );

  return await contract.isValid(address);
}
```

## Implementation Simplifications (PoC)

✅ **Use these shortcuts**:
- Single attestor (no governance)
- HTTP endpoint verification only
- Use existing Powers of Tau for trusted setup
- No revocation mechanism
- Mock attestor service (can have hardcoded allowlist for demos)

❌ **Don't implement** (out of scope):
- zkTLS
- DNS TXT verification
- Multi-sig attestor governance
- On-chain revocation
- Proof batching

## Testing Strategy

### Unit Tests

1. **Contract tests** (Hardhat):
   - IdentityRegistry: register, isValid, expiry
   - ZKVerifier: proof verification (with sample proofs)

2. **Attestor tests** (Jest):
   - HTTP endpoint verification
   - Signature generation
   - Challenge management

3. **Circuit tests** (circom):
   - Valid signature → proof generates
   - Invalid signature → proof fails

### Integration Tests

1. **End-to-end flow**:
   - Register identity (full ZK flow)
   - Make x402 payment (should succeed)
   - Wait for expiry
   - Make x402 payment (should fail with 403)

2. **Unauthorized client**:
   - Client without identity tries payment
   - Should receive 403 from facilitator

### Manual Testing / Demo Flow

1. Deploy contracts to Conflux eSpace testnet
2. Start attestor service
3. User claims domain via CLI tool
4. Generate and submit ZK proof
5. Verify identity in registry
6. Make x402 payment (auto mode)
7. Show facilitator logs checking identity

## Deployment Checklist

- [ ] Deploy IdentityRegistry contract
- [ ] Deploy ZKVerifier contract
- [ ] Link contracts (set verifier address in registry)
- [ ] Deploy attestor service
- [ ] Generate ZK proving/verification keys
- [ ] Update facilitator with registry address
- [ ] Create CLI tool for identity registration
- [ ] Test full flow on testnet

## Security Considerations

**For PoC** (acceptable risks):
- Single attestor is centralized (ok for demo)
- No attestor key rotation
- Simple expiry without revocation

**For Production** (future work):
- Multi-sig attestor governance
- On-chain revocation mechanism
- Attestor key rotation
- Rate limiting on attestor
- Proof replay protection

## Success Criteria

1. ✅ User can register identity with domain proof
2. ✅ ZK proof verifies on-chain
3. ✅ Identity stored in registry
4. ✅ Facilitator enforces identity check
5. ✅ Unauthorized clients rejected with 403
6. ✅ Full demo flow works end-to-end

## Timeline Estimate (2-3 days)

**Day 1**: Contracts + Circuit
- IdentityRegistry contract
- ZKVerifier contract skeleton
- Circom circuit using circom-ecdsa
- Generate keys, test proofs

**Day 2**: Attestor + Integration
- Attestor service with HTTP verification
- Facilitator integration
- Deploy to testnet
- Unit tests

**Day 3**: CLI Tool + Demo
- Identity registration CLI
- Integration tests
- Polish demo flow
- Documentation
