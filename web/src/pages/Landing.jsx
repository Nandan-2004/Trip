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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass widget-card w-full max-w-md p-8 border border-border">
        <h1 className="text-center mb-6 font-display font-black text-3xl tracking-tight">TripShare</h1>
        
        <div className="flex border-b border-border mb-6">
          <button 
            className={`flex-1 pb-3 text-sm font-medium transition-colors ${mode === "login" ? "border-b-2 border-accent text-accent-text" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button 
            className={`flex-1 pb-3 text-sm font-medium transition-colors ${mode === "register" ? "border-b-2 border-accent text-accent-text" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === "register" && (
            <Input name="name" placeholder="Full Name" required className="rounded-none h-11" />
          )}
          <Input name="email" type="email" placeholder="Email Address" required className="rounded-none h-11" />
          <Input name="password" type="password" placeholder="Password (min. 8 chars)" required minLength={8} className="rounded-none h-11" />
          
          <Button disabled={loading} className="rounded-none h-11 accent-bg hover:opacity-90 w-full mt-2 font-bold">
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
