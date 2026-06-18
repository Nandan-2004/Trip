import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, API } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Lock, ImageIcon, Download, Video, Calendar, ArrowLeft } from "lucide-react";

export default function PublicGallery() {
  const { token } = useParams();
  const [password, setPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [group, setGroup] = useState(null);
  const [media, setMedia] = useState([]);
  const [error, setError] = useState("");
  const [activeMediaItem, setActiveMediaItem] = useState(null);

  const fetchSharedAlbum = async (pwd = "") => {
    setError("");
    try {
      const url = `/groups/share-links/${token}${pwd ? `?password=${encodeURIComponent(pwd)}` : ""}`;
      const res = await fetch(`${API}${url}`);
      const data = await res.json();

      if (res.status === 401) {
        setPasswordRequired(true);
        return;
      }
      if (!res.ok) {
        setError(data.detail || "Failed to load album");
        return;
      }

      setGroup(data.group);
      setMedia(data.media);
      setPasswordRequired(false);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    fetchSharedAlbum();
  }, [token]);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    fetchSharedAlbum(password);
  };

  if (passwordRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <form onSubmit={handlePasswordSubmit} className="glass widget-card w-full max-w-md p-8 border border-border">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
              <Lock className="w-6 h-6 text-accent" />
            </div>
          </div>
          <h2 className="text-center font-bold text-xl mb-2 font-display">Secure Album</h2>
          <p className="text-center text-sm text-muted-foreground mb-6">This share link is password-protected. Enter credentials below to unlock.</p>
          
          {error && <div className="p-3 mb-4 text-sm bg-red-500/10 text-red-500 border border-red-500/20 rounded">{error}</div>}
          
          <div className="flex flex-col gap-4">
            <Input
              type="password"
              placeholder="Album Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-none h-11"
            />
            <Button className="rounded-none accent-bg font-bold h-11">Unlock Album</Button>
            <Link to="/">
              <Button type="button" variant="ghost" className="w-full text-muted-foreground">Back to Login</Button>
            </Link>
          </div>
        </form>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="glass widget-card max-w-md p-8 border border-red-500/30 text-center">
          <h2 className="text-red-500 font-bold text-xl mb-2">Error</h2>
          <p>{error}</p>
          <Link to="/">
            <Button variant="outline" className="mt-6">Return to Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!group) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 h-16 flex items-center justify-between">
        <div className="font-display font-black text-xl tracking-tight">TripShare Public Album</div>
        <Link to="/">
          <Button variant="ghost" className="text-sm">Login / Dashboard</Button>
        </Link>
      </header>

      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <div className="glass widget-card p-6 border border-border mb-8">
          <h1 className="text-2xl font-bold font-display mb-2">{group.name}</h1>
          <p className="text-muted-foreground mb-4">{group.description}</p>
          <div className="inline-flex items-center text-xs font-medium bg-accent/10 text-accent px-3 py-1.5 rounded-full">
            <Calendar className="w-3 h-3 mr-2" /> Trip date: {group.trip_date}
          </div>
        </div>

        <div className="flex flex-col gap-10 animate-in">
          {Object.entries(
            media.reduce((acc, item) => {
              const uploaderName = item.uploader?.name || "Unknown";
              if (!acc[uploaderName]) acc[uploaderName] = [];
              acc[uploaderName].push(item);
              return acc;
            }, {})
          ).map(([uploaderName, items]) => (
            <div key={uploaderName}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xl font-display font-bold">📸 Uploaded by {uploaderName}</h2>
                <span className="bg-muted text-muted-foreground text-xs font-bold px-2 py-0.5 rounded-full">{items.length} items</span>
              </div>
              <div className="grid-photos">
                {items.map((item) => {
                  const fullThumbUrl = item.thumbnail_url || item.download_url;
                  return (
                    <div 
                      key={item.id} 
                      className="group relative aspect-square bg-muted/50 overflow-hidden cursor-pointer shadow-sm hover:shadow-lg transition-all rounded-md"
                      onClick={() => setActiveMediaItem(item)}
                    >
                      <img
                        src={fullThumbUrl}
                        alt={item.original_filename}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        loading="lazy"
                      />
                      
                      {item.media_type === "video" && (
                        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 z-10">
                          <Video className="w-3 h-3" /> Video
                        </div>
                      )}
                      
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 z-20">
                        <p className="text-white text-xs font-medium truncate drop-shadow-md">{item.original_filename}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!activeMediaItem} onOpenChange={(open) => !open && setActiveMediaItem(null)}>
        <DialogContent className="max-w-4xl p-0 bg-black/95 border-border overflow-hidden rounded-none sm:rounded-lg">
          {activeMediaItem && (
            <div className="flex flex-col md:flex-row h-[80vh] md:h-[600px]">
              <div className="flex-1 relative flex items-center justify-center bg-black min-h-[300px]">
                {activeMediaItem.media_type === "video" ? (
                  <video controls src={activeMediaItem.download_url} className="w-full h-full object-contain" />
                ) : (
                  <img src={activeMediaItem.download_url} alt={activeMediaItem.original_filename} className="w-full h-full object-contain" />
                )}
              </div>
              <div className="w-full md:w-80 bg-card border-l border-border flex flex-col">
                <DialogHeader className="p-4 border-b border-border">
                  <DialogTitle className="text-sm truncate pr-6">{activeMediaItem.original_filename}</DialogTitle>
                </DialogHeader>
                <div className="p-4 flex-1 flex flex-col gap-4 text-sm text-muted-foreground">
                  <div>Size: {Math.round(activeMediaItem.size_bytes / (1024 * 1024) * 100) / 100} MB</div>
                  <div>Type: {activeMediaItem.media_type}</div>
                </div>
                <div className="p-4 border-t border-border mt-auto">
                  <a href={activeMediaItem.download_url} download>
                    <Button className="w-full rounded-none font-bold accent-bg">
                      <Download className="w-4 h-4 mr-2" /> Download Original File
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
