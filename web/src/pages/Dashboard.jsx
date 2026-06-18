import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, API } from "@/api";
import Nav from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Image, Users, Calendar, PlusCircle, DownloadCloud, Check, X } from "lucide-react";

export default function Dashboard() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [invites, setInvites] = useState([]);
  const [zipJobs, setZipJobs] = useState([]);

  const loadData = async () => {
    try {
      const gs = await api("/groups");
      setGroups(gs);
      const invs = await api("/groups/invites/inbox");
      setInvites(invs);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load dashboard data");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Simplified polling for zip jobs if they exist in localStorage (since they are background processes)
  // In the real app, we might need a dedicated endpoint for active user jobs
  // For now, we'll keep it simple or omit if not tracked globally

  const createGroup = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const newG = await api("/groups", { method: "POST", body: payload });
      toast.success("Group created successfully");
      navigate(`/groups/${newG.id}`);
    } catch (e) {
      toast.error(e.message || "Failed to create group");
    }
  };

  const handleInvite = async (inviteId, action) => {
    try {
      await api(`/groups/invites/${inviteId}/${action}`, { method: "POST" });
      toast.success(`Invite ${action}ed`);
      loadData();
    } catch (e) {
      toast.error(e.message || "Action failed");
    }
  };

  return (
    <div className="min-h-screen bg-transparent pb-20 md:pb-0">
      <Nav />
      <div className="p-4 md:p-10 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 animate-in">
        
        {/* Left column: Create Group & Invites */}
        <div className="flex flex-col gap-6">
          <div className="glass widget-card p-6 border border-border/50 shadow-lg relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <h2 className="text-lg font-display font-bold mb-5 flex items-center gap-2"><PlusCircle className="w-5 h-5 text-accent" /> Start New Trip</h2>
            <form onSubmit={createGroup} className="flex flex-col gap-4 relative z-10">
              <div>
                <Label className="text-xs mb-1.5 block text-muted-foreground font-medium">Trip Name</Label>
                <Input name="name" required className="rounded-md h-11 bg-background/50 focus:bg-background transition-colors" placeholder="e.g. Hawaii 2026" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block text-muted-foreground font-medium">Description</Label>
                <Input name="description" required className="rounded-md h-11 bg-background/50 focus:bg-background transition-colors" placeholder="Short description" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block text-muted-foreground font-medium">Date</Label>
                <Input type="date" name="trip_date" required className="rounded-md h-11 bg-background/50 focus:bg-background transition-colors" />
              </div>
              <Button className="rounded-md accent-bg mt-4 font-bold h-11 hover:scale-[1.02] transition-transform shadow-md">Create Group</Button>
            </form>
          </div>

          {invites.length > 0 && (
            <div className="glass widget-card p-6 border border-warning/30 bg-warning/5 shadow-lg">
              <h2 className="text-lg font-display font-bold mb-4 text-warning flex items-center gap-2">Pending Invites <span className="bg-warning text-warning-foreground text-xs px-2 py-0.5 rounded-full">{invites.length}</span></h2>
              <div className="flex flex-col gap-3">
                {invites.map(inv => (
                  <div key={inv.id} className="bg-background/80 backdrop-blur p-4 border border-border/50 rounded-lg flex flex-col gap-3 shadow-sm">
                    <span className="text-sm font-medium">Trip Group Invitation</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-9 flex-1 border-green-500/30 text-green-500 hover:bg-green-500/10 hover:border-green-500/50 transition-colors" onClick={() => handleInvite(inv.id, 'accept')}><Check className="w-4 h-4 mr-1"/> Accept</Button>
                      <Button size="sm" variant="outline" className="h-9 flex-1 border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500/50 transition-colors" onClick={() => handleInvite(inv.id, 'decline')}><X className="w-4 h-4 mr-1"/> Decline</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Groups List */}
        <div className="md:col-span-2">
          <h1 className="text-3xl font-bold mb-8 font-display tracking-tight flex items-center gap-3">
            Your Trip Groups
            <span className="text-sm font-medium bg-muted text-muted-foreground px-3 py-1 rounded-full border border-border/50">{groups.length}</span>
          </h1>
          
          {groups.length === 0 ? (
            <div className="glass p-16 text-center border border-border/50 shadow-sm flex flex-col items-center rounded-xl bg-gradient-to-b from-transparent to-muted/20">
              <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mb-6">
                <Image className="w-10 h-10 text-accent opacity-80" />
              </div>
              <h3 className="text-xl font-display font-bold mb-3">No trips yet</h3>
              <p className="text-base text-muted-foreground max-w-md leading-relaxed">Create a new trip group using the form to start sharing photos and videos with your friends.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {groups.map(group => (
                <Link to={`/groups/${group.id}`} key={group.id} className="glass p-6 border border-border/50 hover:border-accent/50 transition-all cursor-pointer group rounded-xl shadow-sm hover:shadow-md hover:-translate-y-1 relative overflow-hidden flex flex-col h-full">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl -mr-10 -mt-10 transition-opacity group-hover:opacity-100 opacity-0" />
                  <h3 className="font-bold font-display text-xl mb-2 group-hover:text-accent transition-colors relative z-10">{group.name}</h3>
                  <p className="text-sm text-muted-foreground mb-6 line-clamp-2 leading-relaxed relative z-10 flex-1">{group.description}</p>
                  <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground bg-muted/50 w-fit px-3 py-1.5 rounded-md border border-border/50 relative z-10">
                    <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-accent" /> {group.trip_date}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
