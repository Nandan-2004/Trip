import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, API } from "@/api";
import Nav from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ImageIcon, Users, Calendar, PlusCircle, DownloadCloud, Check, X } from "lucide-react";

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
    <div className="min-h-screen bg-background pb-20 md:pb-0 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#8B8FA8 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
      <Nav />
      <div className="p-4 md:p-10 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-[38%_58%] gap-8 md:gap-[4%] relative z-10">
        
        {/* Left column: Create Group & Invites */}
        <div className="flex flex-col gap-6 animate-fadeInUp">
          <div className="bg-surface p-8 border border-border-color shadow-2xl rounded-2xl relative overflow-hidden">
            <h2 className="text-2xl font-display font-bold mb-1 text-text-primary">Plan a New Adventure</h2>
            <p className="text-sm text-muted font-medium mb-6">Your next journey starts here.</p>
            <form onSubmit={createGroup} className="flex flex-col gap-5 relative z-10">
              <div>
                <Input name="name" required placeholder="Trip Name (e.g. Hawaii 2026)" />
              </div>
              <div>
                <Input name="description" required placeholder="Short description" />
              </div>
              <div>
                <Input type="date" name="trip_date" required />
              </div>
              <Button variant="primary" className="mt-2 w-full">Create Group</Button>
            </form>
          </div>

          {invites.length > 0 && (
            <div className="bg-surface p-6 border border-accent-secondary/50 rounded-2xl shadow-glow">
              <h2 className="text-lg font-display font-bold mb-4 text-accent-secondary flex items-center gap-2">Pending Invites <span className="bg-accent-secondary/20 text-accent-secondary text-xs px-2 py-0.5 rounded-full">{invites.length}</span></h2>
              <div className="flex flex-col gap-3">
                {invites.map(inv => (
                  <div key={inv.id} className="bg-surface-raised p-4 border border-border-color rounded-xl flex flex-col gap-3">
                    <span className="text-sm font-medium text-text-primary">Trip Group Invitation</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" className="flex-1" onClick={() => handleInvite(inv.id, 'accept')}><Check className="w-4 h-4 mr-1"/> Accept</Button>
                      <Button size="sm" variant="outline" className="flex-1 border-red-500/30 text-red-500 hover:bg-red-500/10" onClick={() => handleInvite(inv.id, 'decline')}><X className="w-4 h-4 mr-1"/> Decline</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Groups List */}
        <div className="animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold font-display tracking-tight text-text-primary flex items-center gap-3">
              Your Trips
              <span className="text-sm font-bold bg-accent-secondary/20 text-accent-secondary px-3 py-1 rounded-full">{groups.length}</span>
            </h1>
            {/* Added optional secondary action here if needed */}
          </div>
          
          {groups.length === 0 ? (
            <div className="bg-surface p-16 text-center border border-border-color shadow-lg flex flex-col items-center rounded-2xl">
              <div className="w-20 h-20 rounded-full bg-surface-raised flex items-center justify-center mb-6">
                <ImageIcon className="w-10 h-10 text-muted opacity-80" />
              </div>
              <h3 className="text-xl font-display font-bold mb-3 text-text-primary">No trips yet</h3>
              <p className="text-base text-muted max-w-md leading-relaxed font-medium">Create your first adventure above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {groups.map(group => (
                <Link to={`/groups/${group.id}`} key={group.id} className="bg-surface p-6 border-x border-b border-t-[3px] border-x-border-color border-b-border-color border-t-accent-primary hover:border-t-accent-secondary transition-all cursor-pointer group rounded-2xl shadow-md hover:shadow-glow hover:-translate-y-1 relative flex flex-col h-full">
                  <h3 className="font-bold font-display text-xl mb-2 text-text-primary transition-colors">{group.name}</h3>
                  <p className="text-sm text-muted mb-6 line-clamp-2 leading-relaxed flex-1 font-medium">{group.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-accent-secondary bg-accent-secondary/10 px-3 py-1.5 rounded-lg">
                      <Calendar className="w-3.5 h-3.5" /> {group.trip_date}
                    </div>
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
