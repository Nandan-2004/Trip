import React, { useEffect, useState } from "react";
import { api } from "@/api";
import Nav from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UserPlus, User, Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Friends() {
  const [friends, setFriends] = useState([]);
  const [inbox, setInbox] = useState([]);
  const navigate = useNavigate();

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

  // OTP input logic
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', '']);
  const codeRefs = React.useRef([]);

  const handleDigitChange = (index, value) => {
    if (value.length > 1) value = value.slice(-1);
    const newDigits = [...codeDigits];
    newDigits[index] = value.toUpperCase();
    setCodeDigits(newDigits);

    if (value && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  const sendRequest = async (e) => {
    e.preventDefault();
    const code = codeDigits.join('');
    if (code.length !== 6) {
      toast.error("Please enter a 6-digit code");
      return;
    }
    try {
      await api("/friends/requests", { method: "POST", body: { friend_code: code } });
      toast.success("Friend request sent!");
      setCodeDigits(['', '', '', '', '', '']);
      codeRefs.current[0]?.focus();
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
    <div className="min-h-screen bg-background pb-20 md:pb-0 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#8B8FA8 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
      <Nav />
      <div className="p-4 md:p-10 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-[38%_58%] gap-8 md:gap-[4%] relative z-10">
        
        <div className="flex flex-col gap-6 animate-fadeInUp">
          <div className="bg-surface p-8 border border-border-color shadow-2xl rounded-2xl relative overflow-hidden">
            <h2 className="text-2xl font-display font-bold mb-6 text-text-primary">Find a Friend</h2>
            <form onSubmit={sendRequest} className="flex flex-col gap-6 relative z-10">
              <div className="flex justify-between gap-2">
                {codeDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => codeRefs.current[i] = el}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(i, e)}
                    className="w-12 h-14 bg-input border border-border-color rounded-[10px] text-center font-mono text-xl text-text-primary focus:border-accent-primary focus:outline-none transition-colors"
                  />
                ))}
              </div>
              <Button variant="primary" className="w-full">Add Friend</Button>
            </form>
          </div>

          {inbox.length > 0 && (
            <div className="bg-surface p-6 border border-accent-secondary/50 rounded-2xl shadow-glow">
              <h2 className="text-lg font-display font-bold mb-4 text-accent-secondary flex items-center gap-2">Pending Requests <span className="bg-accent-secondary/20 text-accent-secondary text-xs px-2 py-0.5 rounded-full">{inbox.length}</span></h2>
              <div className="flex flex-col gap-3">
                {inbox.map(req => (
                  <div key={req.id} className="bg-surface-raised p-4 border border-border-color rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-input flex items-center justify-center">
                        <User className="w-4 h-4 text-muted" />
                      </div>
                      <span className="text-sm font-medium text-text-primary">{req.sender_name}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => handleRequest(req.id, 'accept')}><Check className="w-4 h-4"/></Button>
                      <Button size="icon" variant="outline" className="h-8 w-8 border-red-500/30 text-red-500 hover:bg-red-500/10" onClick={() => handleRequest(req.id, 'decline')}><X className="w-4 h-4"/></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
          <h1 className="text-3xl font-bold mb-8 font-display tracking-tight text-text-primary flex items-center gap-3">
            Travel Crew
            <span className="text-sm font-bold bg-accent-secondary/20 text-accent-secondary px-3 py-1 rounded-full">{friends.length}</span>
          </h1>
          
          {friends.length === 0 ? (
            <div className="bg-surface p-16 text-center border border-border-color shadow-lg rounded-2xl flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-surface-raised flex items-center justify-center mb-6">
                <UserPlus className="w-10 h-10 text-muted opacity-80" />
              </div>
              <h3 className="text-xl font-display font-bold mb-3 text-text-primary">No friends yet</h3>
              <p className="text-base text-muted max-w-sm leading-relaxed font-medium">Add friends using their 6-digit code to invite them to your trip groups.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {friends.map(f => (
                <div key={f.id} className="bg-surface p-5 border border-border-color rounded-2xl shadow-md flex flex-col gap-4 hover:border-accent-primary transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary p-[2px]">
                      <div className="w-full h-full bg-surface rounded-full flex items-center justify-center">
                        <User className="w-6 h-6 text-text-primary" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-text-primary">{f.name}</h3>
                      <p className="text-xs text-muted font-mono mt-0.5">#{f.friend_code}</p>
                    </div>
                  </div>
                  <Button variant="secondary" className="w-full opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => navigate('/dashboard')}>Plan a trip</Button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
