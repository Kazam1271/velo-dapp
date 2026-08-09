"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ethers } from "ethers";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useAppKitAccount, useAppKit, useAppKitProvider } from "@reown/appkit/react";

/** Must match buildVerifyMessage in api/discord/verify exactly, byte for byte. */
function buildVerifyMessage(code: string): string {
  return [
    "Link your wallet to the Velo Discord.",
    "",
    "This is a free signature — it is not a transaction and cannot move funds.",
    "",
    `Code: ${code}`,
  ].join("\n");
}

interface Result {
  wallet: string;
  xp: number;
  swaps: number;
  rolesGranted: string[];
  rolesFailed: string[];
}

export default function VerifyDiscord() {
  const params = useSearchParams();
  const code = params.get("code") || "";

  const { address, isConnected } = useAppKitAccount();
  const { open } = useAppKit();
  const { walletProvider } = useAppKitProvider("eip155");

  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleVerify = async () => {
    if (!walletProvider || !code) return;
    setIsSigning(true);
    setError(null);

    try {
      const provider = new ethers.BrowserProvider(walletProvider as any);
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(buildVerifyMessage(code));

      const res = await fetch("/api/discord/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, signature }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Verification failed.");
        return;
      }
      setResult(data);
    } catch (err: any) {
      const rejected = err?.code === "ACTION_REJECTED" || /reject|denied/i.test(err?.message || "");
      setError(rejected ? "You declined the signature." : err?.message || "Something went wrong.");
    } finally {
      setIsSigning(false);
    }
  };

  if (!mounted) return <div className="min-h-screen bg-velo-bg" />;

  return (
    <div className="w-full max-w-md mx-auto mt-12 mb-24 px-4">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Link your wallet</h1>
        <p className="text-gray-400 text-sm">
          Connect and sign to earn Discord roles from your real Velo XP.
        </p>
      </div>

      <div className="bg-velo-card border border-velo-border rounded-3xl p-6 shadow-2xl">
        {!code ? (
          <div className="text-center py-6">
            <XCircle className="mx-auto text-rose-400 mb-3" size={32} />
            <p className="text-sm text-gray-300 font-bold mb-1">No verification code</p>
            <p className="text-xs text-gray-500">
              Run <span className="text-velo-cyan font-mono">/verify</span> in the Velo Discord to get your personal link.
            </p>
          </div>
        ) : result ? (
          <div className="text-center py-4">
            <CheckCircle2 className="mx-auto text-velo-green mb-3" size={36} />
            <p className="text-lg font-bold text-white mb-1">Wallet linked</p>
            <p className="text-xs text-gray-500 font-mono break-all mb-4">{result.wallet}</p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-black/30 rounded-2xl p-3 border border-white/5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Velo XP</div>
                <div className="text-xl font-bold text-velo-cyan">{result.xp}</div>
              </div>
              <div className="bg-black/30 rounded-2xl p-3 border border-white/5">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Swaps</div>
                <div className="text-xl font-bold text-white">{result.swaps}</div>
              </div>
            </div>

            {result.rolesGranted.length > 0 ? (
              <p className="text-xs text-gray-300">
                Roles granted:{" "}
                <span className="text-velo-green font-bold">{result.rolesGranted.join(", ")}</span>
              </p>
            ) : (
              <p className="text-xs text-gray-400">
                No roles yet — earn Velo XP by swapping, staking, or transferring, then run{" "}
                <span className="text-velo-cyan font-mono">/verify</span> again.
              </p>
            )}

            {result.rolesFailed.length > 0 && (
              <p className="text-[11px] text-amber-400 mt-2">
                Couldn&apos;t grant: {result.rolesFailed.join(", ")} — ping a mod in #support.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="bg-velo-cyan/5 border border-velo-cyan/20 rounded-2xl px-4 py-3 mb-5 flex items-start gap-3">
              <ShieldCheck size={16} className="text-velo-cyan shrink-0 mt-0.5" />
              <span className="text-xs text-gray-300 leading-relaxed">
                You&apos;ll sign a <span className="text-velo-cyan font-bold">free message</span> to prove you
                own this wallet. It is <span className="font-bold">not a transaction</span>, costs nothing, and
                cannot move your funds.
              </span>
            </div>

            {isConnected && address && (
              <p className="text-[11px] text-gray-500 text-center mb-4 font-mono break-all">{address}</p>
            )}

            <button
              onClick={isConnected ? handleVerify : () => open()}
              disabled={isSigning}
              className="w-full bg-velo-cyan hover:bg-cyan-300 disabled:opacity-40 text-slate-950 text-lg font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-3"
            >
              {isSigning ? (
                <Loader2 size={20} className="animate-spin" />
              ) : isConnected ? (
                "Sign & Link Wallet"
              ) : (
                "Connect Wallet"
              )}
            </button>

            {error && <p className="text-xs text-rose-400 text-center mt-4">{error}</p>}

            <p className="text-[10px] text-gray-600 text-center mt-4">
              Swap currently requires an ECDSA wallet (MetaMask / Reown). Native HashPack linking is coming.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
