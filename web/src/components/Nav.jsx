import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { api } from "@/api";
import { Bell, Moon, Sun, User, LogOut } from "lucide-react";
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
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 h-16 flex items-center justify-between">
      <div className="flex gap-6 md:gap-10">
        <Link to="/dashboard" className="font-display font-black text-xl tracking-tight flex items-center space-x-2">
          <span>TripShare</span>
        </Link>
        <nav className="hidden md:flex gap-6">
          <Link to="/dashboard" className={`text-sm font-medium transition-colors hover:text-foreground/80 ${location.pathname.startsWith("/dashboard") ? "text-foreground" : "text-foreground/60"}`}>Dashboard</Link>
          <Link to="/friends" className={`text-sm font-medium transition-colors hover:text-foreground/80 ${location.pathname.startsWith("/friends") ? "text-foreground" : "text-foreground/60"}`}>Friends</Link>
        </nav>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="relative">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setShowNotifs(!showNotifs)}>
            <Bell className="h-5 w-5 text-muted-foreground" />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 h-4 w-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
                {unreadCount}
              </span>
            )}
          </Button>

          {showNotifs && (
            <div className="absolute right-0 mt-2 w-80 glass border border-border shadow-md rounded-md z-50 overflow-hidden">
              <div className="p-3 border-b border-border flex justify-between items-center bg-muted/50">
                <span className="font-semibold text-sm">Notifications ({unreadCount})</span>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={markAllRead}>Mark all read</button>
              </div>
              <div className="max-h-80 overflow-y-auto p-2 flex flex-col gap-2">
                {notifications.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-4">No notifications yet</div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className={`p-3 text-sm rounded-md border border-border ${n.read_at ? "bg-transparent" : "bg-accent/10"}`}>
                      <div className="text-xs text-muted-foreground mb-1">{new Date(n.created_at).toLocaleString()}</div>
                      <div>
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
            <User className="h-5 w-5 text-muted-foreground" />
          </Button>
        </Link>

        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun className="h-5 w-5 text-muted-foreground" /> : <Moon className="h-5 w-5 text-muted-foreground" />}
        </Button>

        <Button variant="ghost" size="icon" className="rounded-full hover:text-red-500 hover:bg-red-500/10" onClick={logout}>
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
