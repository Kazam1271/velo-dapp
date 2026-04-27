"use client";

import nextDynamic from "next/dynamic";

const ProfileView = nextDynamic(() => import("@/components/ProfileView"), { 
  ssr: false,
  loading: () => <div className="min-h-screen bg-velo-bg" />
});

export default function ProfilePage() {
  return <ProfileView />;
}
