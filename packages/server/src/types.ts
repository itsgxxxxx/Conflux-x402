import type { WalletContext, PolicyConfig } from '@conflux-x402/chain-config'

export interface RequestContext {
  wallet?: WalletContext
}

export interface GateRouteConfig {
  readonly enableIdentity: boolean
  readonly policy?: PolicyConfig | string
  readonly enablePayment: boolean
  readonly price?: string
  readonly description: string
  readonly mimeType?: string
  readonly resourceId?: string
}

export interface ForbiddenResponseBody {
  readonly error: 'IDENTITY_REQUIRED'
  readonly code: 'TAG_MISSING' | 'TAG_EXPIRED' | 'ISSUER_NOT_TRUSTED'
  readonly requiredPolicy?: PolicyConfig | string
  readonly missingTags: readonly string[]
}
