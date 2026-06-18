import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { api } from "@/api";
import { Bell, Moon, Sun, User, LogOut, ImageIcon, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Nav() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!user) return;
    const fetchNotifs = async () => {
      try {
        const notifs = await api("/notifications");
        setNotifications(notifs);
        const countRes = await api("/notifications/unread-count");
        setUnreadCount(countRes.count);
      } catch (e) {
        console.error(e);
      }
    };
    fetchNotifs();
    const int = setInterval(fetchNotifs, 8000);
    return () => clearInterval(int);
  }, [user]);

  const markAllRead = async () => {
    try {
      await api("/notifications/read-all", { method: "POST" });
      setUnreadCount(0);
      const notifs = await api("/notifications");
      setNotifications(notifs);
    } catch (e) {
      console.error(e);
    }
  };

  if (!user) return null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border-color bg-background/80 backdrop-blur-[12px] px-4 md:px-8 h-16 flex items-center justify-between">
      <div className="flex gap-6 md:gap-10">
        <Link to="/dashboard" className="font-display font-black text-2xl tracking-tight flex items-center space-x-2 text-text-primary">
          <span>TripShare</span>
          <span className="text-accent-primary text-xl">✈️</span>
        </Link>
        <nav className="hidden md:flex gap-8 items-center">
          <Link to="/dashboard" className={`text-sm font-medium transition-colors hover:text-text-primary border-b-2 py-5 ${location.pathname.startsWith("/dashboard") ? "text-text-primary border-accent-primary" : "text-muted border-transparent"}`}>Dashboard</Link>
          <Link to="/friends" className={`text-sm font-medium transition-colors hover:text-text-primary border-b-2 py-5 ${location.pathname.startsWith("/friends") ? "text-text-primary border-accent-primary" : "text-muted border-transparent"}`}>Friends</Link>
        </nav>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="relative">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setShowNotifs(!showNotifs)}>
            <Bell className="h-5 w-5 text-muted hover:text-text-primary transition-colors" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 h-3 w-3 bg-red-500 text-transparent rounded-full text-[10px] animate-pulse">
              </span>
            )}
          </Button>

          {showNotifs && (
            <div className="absolute right-0 mt-2 w-80 bg-surface border border-border-color shadow-glow rounded-xl z-50 overflow-hidden">
              <div className="p-4 border-b border-border-color flex justify-between items-center bg-surface-raised">
                <span className="font-semibold text-sm text-text-primary">Notifications ({unreadCount})</span>
                <button className="text-xs text-accent-secondary hover:text-white transition-colors" onClick={markAllRead}>Mark all read</button>
              </div>
              <div className="max-h-80 overflow-y-auto p-2 flex flex-col gap-2">
                {notifications.length === 0 ? (
                  <div className="text-center text-sm text-muted py-6">No new notifications</div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className={`p-3 text-sm rounded-lg border border-border-color ${n.read_at ? "bg-transparent" : "bg-accent-primary/10"}`}>
                      <div className="text-xs text-muted mb-1">{new Date(n.created_at).toLocaleString()}</div>
                      <div className="text-text-primary font-medium">
                        {n.type === 'media_uploaded' && 'New media was uploaded to your group'}
                        {n.type === 'member_joined' && 'A member joined your group'}
                        {n.type === 'group_invite' && 'You were invited to join a group'}
                        {n.type === 'friend_request' && 'You received a friend request'}
                        {n.type === 'friend_request_accepted' && 'Your friend request was accepted'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <Link to="/profile">
          <Button variant="ghost" size="icon" className="rounded-full">
            <User className="h-5 w-5 text-muted hover:text-text-primary transition-colors" />
          </Button>
        </Link>

        {/* Removed theme toggle since design is dark-mode only */}

        <Button variant="ghost" size="icon" className="rounded-full hover:text-red-500 hover:bg-red-500/10" onClick={logout}>
          <LogOut className="h-5 w-5" />
        </Button>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-[12px] border-t border-border-color flex justify-around items-center h-16 pb-safe">
        <Link to="/dashboard" className={`flex flex-col items-center justify-center w-full h-full ${location.pathname.startsWith("/dashboard") ? "text-accent-primary" : "text-muted hover:text-text-primary"}`}>
          <ImageIcon className="h-6 w-6 mb-1" />
          <span className="text-[10px] font-medium">Trips</span>
        </Link>
        <Link to="/friends" className={`flex flex-col items-center justify-center w-full h-full ${location.pathname.startsWith("/friends") ? "text-accent-primary" : "text-muted hover:text-text-primary"}`}>
          <Users className="h-6 w-6 mb-1" />
          <span className="text-[10px] font-medium">Friends</span>
        </Link>
        <Link to="/profile" className={`flex flex-col items-center justify-center w-full h-full ${location.pathname.startsWith("/profile") ? "text-accent-primary" : "text-muted hover:text-text-primary"}`}>
          <User className="h-6 w-6 mb-1" />
          <span className="text-[10px] font-medium">Profile</span>
        </Link>
      </nav>
    </header>
  );
}
