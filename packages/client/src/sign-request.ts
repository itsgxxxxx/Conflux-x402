import {
  keccak256,
  encodePacked,
  toBytes,
  type Account,
  type WalletClient,
} from 'viem'

const ZERO_BODY_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const
const DEFAULT_EXPIRY_S = 30

export interface AuthHeaders {
  'X-Payer': string
  'X-Auth-Signature': string
  'X-Auth-Nonce': string
  'X-Auth-Expiry': string
}

export interface SignRequestParams {
  method: string
  url: string
  body?: string
  chainId: number
}

/**
 * Build the canonical message that must match the server-side implementation.
 */
export function buildCanonicalMessage(params: {
  chainId: number
  host: string
  method: string
  path: string
  bodyHash: string
  nonce: string
  expiry: string
}): `0x${string}` {
  return keccak256(
    encodePacked(
      ['string', 'uint256', 'string', 'string', 'string', 'bytes32', 'string', 'string'],
      [
        'X402-AUTH',
        BigInt(params.chainId),
        params.host,
        params.method,
        params.path,
        params.bodyHash as `0x${string}`,
        params.nonce,
        params.expiry,
      ],
    ),
  )
}

/**
 * Sign a request and return auth headers.
 */
export async function signRequest(
  walletClient: WalletClient & { account: Account },
  params: SignRequestParams,
): Promise<AuthHeaders> {
  const parsed = new URL(params.url)
  const host = parsed.host
  const path = parsed.pathname
  const method = params.method.toUpperCase()

  // bodyHash: 0x0 for GET/HEAD, keccak256(body) for others
  let bodyHash = ZERO_BODY_HASH as string
  if (method !== 'GET' && method !== 'HEAD' && params.body) {
    bodyHash = keccak256(toBytes(params.body))
  }

  const nonce = crypto.randomUUID()
  const expiry = String(Math.floor(Date.now() / 1000) + DEFAULT_EXPIRY_S)

  const message = buildCanonicalMessage({
    chainId: params.chainId,
    host,
    method,
    path,
    bodyHash,
    nonce,
    expiry,
  })

  const signature = await walletClient.signMessage({
    account: walletClient.account,
    message: { raw: message },
  })

  return {
    'X-Payer': walletClient.account.address,
    'X-Auth-Signature': signature,
    'X-Auth-Nonce': nonce,
    'X-Auth-Expiry': expiry,
  }
}

export { ZERO_BODY_HASH }
