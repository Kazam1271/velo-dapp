"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, ArrowLeftRight, Droplets, Send, MessageSquare, FileText } from "lucide-react";
import { useEffect, useState } from "react";

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="min-h-screen bg-[#05070a]" />;

  return (
    <div className="relative min-h-screen bg-[#05070a] overflow-x-hidden selection:bg-velo-cyan/30 text-white font-sans">
      
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Deep space radial gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#0c121e] via-[#05070a] to-[#05070a]"></div>
        
        {/* Animated glowing orbs */}
        <motion.div 
          animate={{ x: [0, 50, 0], y: [0, -50, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-[10%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-velo-cyan/5 blur-[120px]"
        />
        <motion.div 
          animate={{ x: [0, -50, 0], y: [0, 50, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[10%] right-[10%] w-[50vw] h-[50vw] rounded-full bg-violet-600/5 blur-[150px]"
        />
        
        {/* Hashgraph Grid Lines */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        
        {/* Hero Section */}
        <section className="flex-1 flex flex-col items-center justify-center px-4 pt-32 pb-20 text-center">
          
          {/* Main Header — logo.png wordmark */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex items-center justify-center mb-6"
          >
            <img
              src="/logo.png"
              alt="Velo"
              className="h-52 md:h-72 w-auto object-contain drop-shadow-[0_0_40px_rgba(34,211,238,0.55)] select-none"
              draggable={false}
            />
          </motion.div>

          {/* Motto */}
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="text-2xl md:text-4xl font-light text-gray-300 mb-8 max-w-2xl"
          >
            Unlock Frictionless DeFi on Hedera.
          </motion.h2>

          {/* Sub-Motto */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
            className="flex items-center justify-center gap-4 text-sm md:text-lg font-bold tracking-widest uppercase text-gray-400 mb-16"
          >
            <span>Swap</span>
            <span className="w-1.5 h-1.5 rounded-full bg-velo-cyan shadow-[0_0_10px_rgba(34,211,238,0.8)]"></span>
            <span>Earn</span>
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.8)]"></span>
            <span>Transfer</span>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
          >
            <Link 
              href="/swap"
              className="group relative inline-flex items-center justify-center gap-3 px-10 py-5 bg-velo-cyan/10 hover:bg-velo-cyan/20 border border-velo-cyan/30 rounded-full text-velo-cyan font-bold text-xl transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-velo-cyan/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
              <span className="drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">Dive in</span>
              <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>
        </section>

        {/* Feature Cards Section */}
        <section className="w-full max-w-6xl mx-auto px-4 pb-32">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Swap Card */}
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
              className="bg-[#0b101a]/60 backdrop-blur-xl border border-white/10 rounded-3xl p-8 hover:border-velo-cyan/30 hover:bg-[#0b101a]/80 transition-all group"
            >
              <div className="w-14 h-14 rounded-2xl bg-velo-cyan/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <ArrowLeftRight className="text-velo-cyan" size={28} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Brokerage Swap</h3>
              <p className="text-gray-400 leading-relaxed">
                Sell tokens like USDC and VELO directly to the Treasury for HBAR with live prices and a flat zero-slippage fee.
              </p>
            </motion.div>

            {/* Earn Card */}
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-[#0b101a]/60 backdrop-blur-xl border border-white/10 rounded-3xl p-8 hover:border-velo-green/30 hover:bg-[#0b101a]/80 transition-all group"
            >
              <div className="w-14 h-14 rounded-2xl bg-velo-green/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Droplets className="text-velo-green" size={28} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Yield Vaults</h3>
              <p className="text-gray-400 leading-relaxed">
                Deposit VELO or HBAR into Treasury-managed single-sided staking vaults to accrue dynamic 12.5% APY rewards.
              </p>
            </motion.div>

            {/* Transfer Card */}
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="bg-[#0b101a]/60 backdrop-blur-xl border border-white/10 rounded-3xl p-8 hover:border-violet-400/30 hover:bg-[#0b101a]/80 transition-all group"
            >
              <div className="w-14 h-14 rounded-2xl bg-violet-400/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Send className="text-violet-400" size={28} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Transfer</h3>
              <p className="text-gray-400 leading-relaxed">
                Secure, instant peer-to-peer asset transfers natively on the Hedera network with ultra-low predictable fees.
              </p>
            </motion.div>

          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 py-12 mt-auto">
          <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity">
              <img src="/logov.png" alt="Velo" className="w-6 h-6 grayscale" />
              <span className="font-bold tracking-widest text-sm">VELO &copy; 2026</span>
            </div>
            
            <div className="flex items-center gap-6">
              {/* X / Twitter */}
              <a href="#" className="text-gray-500 hover:text-velo-cyan hover:drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] transition-all">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.261 5.632L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>
              </a>
              {/* GitHub */}
              <a href="#" className="text-gray-500 hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>
              </a>
              <a href="mailto:velo.dapp@gmail.com" title="Contact us" className="text-gray-500 hover:text-violet-400 hover:drop-shadow-[0_0_8px_rgba(167,139,250,0.8)] transition-all">
                <MessageSquare size={20} />
              </a>
              <a href="#" className="text-gray-500 hover:text-velo-green hover:drop-shadow-[0_0_8px_rgba(34,197,94,0.8)] transition-all">
                <FileText size={20} />
              </a>
            </div>
          </div>
        </footer>

      </div>
      
      <style jsx global>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
