interface ImportMetaEnv {
  /** Optional Sepolia RPC override; falls back to the public RPC when unset. */
  readonly VITE_SEPOLIA_RPC_URL?: string
  /** Optional Reown (WalletConnect Cloud) project id; enables WalletConnect when set. */
  readonly VITE_REOWN_PROJECT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
