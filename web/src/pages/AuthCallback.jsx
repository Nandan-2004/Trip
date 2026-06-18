import React from "react";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[500px] h-[500px] bg-accent-primary/10 rounded-full blur-[100px] mix-blend-screen pointer-events-none" />
      <Loader2 className="w-12 h-12 text-accent-primary animate-spin mb-4 relative z-10" />
      <p className="text-text-primary font-display text-xl relative z-10">Authenticating...</p>
    </div>
  );
}
