import { ArrowLeftRight, Droplets, Activity, User } from "lucide-react";

export default function BottomNav() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-2">
      <div className="bg-velo-card border border-velo-border rounded-2xl flex items-center justify-around py-3 px-2 shadow-2xl backdrop-blur-md max-w-md mx-auto">
        <button className="flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl bg-velo-green/10 text-velo-green">
          <ArrowLeftRight size={20} />
          <span className="text-xs font-semibold">Swap</span>
        </button>

        <button className="flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl text-gray-500 hover:text-gray-300 transition-colors">
          <Droplets size={20} />
          <span className="text-xs font-medium">Pools</span>
        </button>

        <button className="flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl text-gray-500 hover:text-gray-300 transition-colors">
          <Activity size={20} />
          <span className="text-xs font-medium">Activity</span>
        </button>

        <button className="flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl text-gray-500 hover:text-gray-300 transition-colors">
          <User size={20} />
          <span className="text-xs font-medium">Profile</span>
        </button>
      </div>
    </div>
  );
}
