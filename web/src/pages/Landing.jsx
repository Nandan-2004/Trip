import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";

export default function Landing() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      if (mode === "login") {
        await login(data.email, data.password);
        toast.success("Welcome back!");
      } else {
        await register(data.name, data.email, data.password);
        toast.success("Account created successfully!");
      }
    } catch (err) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-background overflow-hidden">
      {/* Background glowing blobs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-[1000px] pointer-events-none">
        <div className="absolute top-[40%] left-[30%] w-[600px] h-[600px] bg-accent-primary/15 rounded-full blur-[120px] mix-blend-screen -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute top-[60%] left-[70%] w-[500px] h-[500px] bg-accent-secondary/15 rounded-full blur-[100px] mix-blend-screen -translate-x-1/2 -translate-y-1/2" />
      </div>

      <div className="relative z-10 w-full max-w-[420px] bg-surface rounded-[24px] p-8 md:p-10 border border-border-color shadow-2xl animate-fadeInUp">
        <div className="text-center mb-8">
          <h1 className="font-display font-black text-4xl tracking-tight text-text-primary mb-2 flex items-center justify-center gap-2">
            <span>TripShare</span>
            <span className="text-accent-primary text-3xl">✈️</span>
          </h1>
          <p className="text-muted text-sm font-medium">Plan together. Travel better.</p>
        </div>
        
        <div className="flex border-b border-border-color mb-8">
          <button 
            className={`flex-1 pb-3 text-sm font-bold transition-all ${mode === "login" ? "border-b-2 border-accent-primary text-text-primary" : "text-muted hover:text-text-primary border-transparent border-b-2"}`}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button 
            className={`flex-1 pb-3 text-sm font-bold transition-all ${mode === "register" ? "border-b-2 border-accent-primary text-text-primary" : "text-muted hover:text-text-primary border-transparent border-b-2"}`}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-5">
          {mode === "register" && (
            <Input name="name" placeholder="Full Name" required />
          )}
          <Input name="email" type="email" placeholder="Email Address" required />
          <Input name="password" type="password" placeholder="Password (min. 8 chars)" required minLength={8} />
          
          <Button disabled={loading} variant="primary" className="w-full mt-4">
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted mt-8 font-medium">
          Secure login · No credit card required
        </p>
      </div>
    </div>
  );
}
