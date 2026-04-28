"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, ArrowLeftRight, Droplets, Send, Twitter, Github, MessageSquare, FileText } from "lucide-react";
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
          
          {/* Main Header */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex items-center justify-center gap-4 mb-6"
          >
            <div className="w-16 h-16 md:w-24 md:h-24 relative rounded-full overflow-hidden shadow-[0_0_40px_rgba(34,211,238,0.3)] border border-velo-cyan/20">
              <img src="/logov.png" alt="Velo Logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-7xl md:text-9xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-velo-cyan to-white drop-shadow-[0_0_30px_rgba(34,211,238,0.4)]">
              VELO
            </h1>
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
              <a href="#" className="text-gray-500 hover:text-velo-cyan hover:drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] transition-all">
                <Twitter size={20} />
              </a>
              <a href="#" className="text-gray-500 hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all">
                <Github size={20} />
              </a>
              <a href="#" className="text-gray-500 hover:text-violet-400 hover:drop-shadow-[0_0_8px_rgba(167,139,250,0.8)] transition-all">
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
