export type Caip2Network = `${string}:${string}`

export interface TokenConfig {
  readonly address: `0x${string}`
  readonly decimals: number
  readonly eip712: {
    readonly name: string
    readonly version: string
  }
}

export interface ChainConfig {
  readonly caip2Id: Caip2Network
  readonly chainId: number
  readonly rpcUrl: string
  readonly token: TokenConfig
}

export interface ForbiddenResponse {
  readonly error: 'IDENTITY_REQUIRED'
  readonly code: 'TAG_MISSING' | 'TAG_EXPIRED' | 'ISSUER_NOT_TRUSTED'
  readonly requiredPolicy: PolicyConfig
  readonly missingTags: readonly string[]
}

export interface PolicyConfig {
  readonly mode: 'ALL_OF' | 'ANY_OF' | 'NONE_OF'
  readonly tags: readonly string[]
}

export interface WalletContext {
  readonly address: `0x${string}`
}
