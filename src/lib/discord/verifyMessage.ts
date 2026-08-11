/**
 * The exact message a wallet signs to prove ownership when linking Discord.
 * Single source of truth for both the client (VerifyDiscord.tsx, which signs
 * it) and the server (api/discord/verify, which recovers the signer from it)
 * — must never drift, or every verification silently fails.
 */
export function buildVerifyMessage(code: string): string {
  return [
    "Link your wallet to the Velo Discord.",
    "",
    "This is a free signature — it is not a transaction and cannot move funds.",
    "",
    `Code: ${code}`,
  ].join("\n");
}
