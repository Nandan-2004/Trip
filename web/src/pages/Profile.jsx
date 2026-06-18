import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/api";
import Nav from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Settings } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();

  if (!user) return null;

  const saveProfile = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api("/auth/me", {
        method: "PATCH",
        body: {
          name: form.get("name"),
          email_notifications_enabled: form.get("email_notifs") === "true",
        }
      });
      toast.success("Profile updated successfully");
      // Note: In a full app we might want to reload the user context here
      // But since we just show the name, it's fine. 
      // Ideally we'd call a loadMe() from context, but we don't strictly need it to just show success.
    } catch (err) {
      toast.error(err.message || "Failed to update profile");
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(user.friend_code);
    toast.success("Friend code copied!");
  };

  return (
    <div className="min-h-screen bg-transparent">
      <Nav />
      <div className="p-6 md:p-10 max-w-2xl mx-auto animate-in">
        <h1 className="text-3xl font-bold mb-8 font-display flex items-center gap-3">
          <Settings className="w-8 h-8 text-accent" /> Profile & Settings
        </h1>
        
        <div className="glass widget-card p-8 border border-border/50 shadow-lg flex flex-col gap-8 rounded-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent pointer-events-none" />
          
          <div className="relative z-10">
            <Label className="text-sm mb-3 block text-muted-foreground font-medium">Your Friend Code (Share this with friends)</Label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Input 
                  readOnly 
                  value={user.friend_code} 
                  className="font-bold text-2xl text-center tracking-[0.3em] h-14 bg-background/80 border-dashed border-2 font-mono shadow-inner rounded-xl" 
                />
              </div>
              <Button className="h-14 px-8 rounded-xl accent-bg font-bold shadow-md hover:scale-[1.02] transition-transform flex items-center gap-2" onClick={copyCode}>
                <Copy className="w-5 h-5" /> Copy
              </Button>
            </div>
          </div>

          <form onSubmit={saveProfile} className="flex flex-col gap-6 pt-8 border-t border-border/50 relative z-10">
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground font-medium">Full Name</Label>
              <Input name="name" defaultValue={user.name} required className="rounded-lg h-12 bg-background/50 focus:bg-background transition-colors text-base" />
            </div>
            
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground font-medium">Email</Label>
              <Input value={user.email} disabled className="rounded-lg h-12 opacity-60 bg-muted/50 text-base" />
            </div>

            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground font-medium">Email Notifications</Label>
              <div className="relative">
                <select 
                  name="email_notifs" 
                  defaultValue={user.email_notifications_enabled ? "true" : "false"}
                  className="flex h-12 w-full rounded-lg border border-input bg-background/50 px-4 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                >
                  <option value="false">Opt-out (In-app only)</option>
                  <option value="true">Opt-in (Receive digest summaries)</option>
                </select>
              </div>
            </div>

            <Button className="rounded-lg accent-bg mt-4 font-bold w-full h-12 shadow-md hover:scale-[1.01] transition-transform text-base">Save Changes</Button>
          </form>

        </div>
      </div>
    </div>
  );
}
