import React, { useEffect, useState } from "react";
import { api } from "@/api";
import Nav from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UserPlus, User, Check, X } from "lucide-react";

export default function Friends() {
  const [friends, setFriends] = useState([]);
  const [inbox, setInbox] = useState([]);

  const loadData = async () => {
    try {
      const fList = await api("/friends");
      setFriends(fList);
      const fInbox = await api("/friends/requests/inbox");
      setInbox(fInbox);
    } catch (e) {
      toast.error("Failed to load friends data");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const sendRequest = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const code = form.get("friend_code");
    try {
      await api("/friends/requests", { method: "POST", body: { friend_code: code } });
      toast.success("Friend request sent!");
      e.currentTarget.reset();
      loadData();
    } catch (e) {
      toast.error(e.message || "Failed to send request");
    }
  };

  const handleRequest = async (requestId, action) => {
    try {
      await api(`/friends/requests/${requestId}/${action}`, { method: "POST" });
      toast.success(`Request ${action}ed`);
      loadData();
    } catch (e) {
      toast.error(e.message || "Action failed");
    }
  };

  return (
    <div className="min-h-screen bg-transparent">
      <Nav />
      <div className="p-6 md:p-10 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 animate-in">
        
        <div className="flex flex-col gap-6">
          <div className="glass widget-card p-6 border border-border/50 shadow-lg relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-100 pointer-events-none" />
            <h2 className="text-xl font-display font-bold mb-4 flex items-center gap-2 relative z-10"><UserPlus className="w-5 h-5 text-accent" /> Add a Friend</h2>
            <form onSubmit={sendRequest} className="flex gap-3 relative z-10">
              <Input name="friend_code" required pattern="\d{6}" maxLength={6} className="rounded-md h-11 flex-1 bg-background/50 focus:bg-background transition-colors font-mono text-center tracking-[0.2em] text-lg" placeholder="123456" />
              <Button className="rounded-md accent-bg h-11 font-bold px-8 shadow-md hover:scale-[1.02] transition-transform">Add</Button>
            </form>
            <p className="text-xs text-muted-foreground mt-3 relative z-10">Ask your friend for their 6-digit code from their profile settings.</p>
          </div>

          {inbox.length > 0 && (
            <div className="glass widget-card p-6 border border-border/50 shadow-lg">
              <h2 className="text-lg font-display font-bold mb-4 flex items-center gap-2">Pending Requests <span className="bg-accent text-accent-foreground text-xs px-2 py-0.5 rounded-full">{inbox.length}</span></h2>
              <div className="flex flex-col gap-3">
                {inbox.map(req => (
                  <div key={req.id} className="bg-background/80 backdrop-blur p-4 border border-border/50 flex items-center justify-between rounded-lg shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <span className="text-sm font-medium">User: {req.sender_id.substring(0, 8)}...</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-full border-green-500/30 text-green-500 hover:bg-green-500/10 hover:border-green-500/50 transition-colors" onClick={() => handleRequest(req.id, 'accept')}><Check className="w-4 h-4"/></Button>
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-full border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500/50 transition-colors" onClick={() => handleRequest(req.id, 'decline')}><X className="w-4 h-4"/></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <h1 className="text-3xl font-bold mb-8 font-display tracking-tight flex items-center gap-3">
            My Friends List
            <span className="text-sm font-medium bg-muted text-muted-foreground px-3 py-1 rounded-full border border-border/50">{friends.length}</span>
          </h1>
          
          {friends.length === 0 ? (
            <div className="glass p-16 text-center border border-border/50 shadow-sm rounded-xl flex flex-col items-center bg-gradient-to-b from-transparent to-muted/20">
              <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mb-6">
                <UserPlus className="w-10 h-10 text-accent opacity-80" />
              </div>
              <h3 className="text-xl font-display font-bold mb-3">No friends yet</h3>
              <p className="text-base text-muted-foreground max-w-sm leading-relaxed">Add friends using their 6-digit code so you can easily invite them to your trip groups.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {friends.map(f => (
                <div key={f.id} className="glass p-5 border border-border/50 rounded-xl shadow-sm flex items-center gap-5 hover:border-accent/50 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center text-accent ring-1 ring-accent/20 shadow-inner">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base mb-0.5">{f.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded border border-border/50">Code: {f.friend_code}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
