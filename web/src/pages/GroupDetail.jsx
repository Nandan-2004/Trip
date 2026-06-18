import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Upload, Heart, Download, Trash2, X, ChevronLeft, ChevronRight, Settings, UserPlus, Play, Check } from "lucide-react";
import { api, API, mediaFileUrl } from "@/api";
import Nav from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export default function GroupDetail() {
  const { groupId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [groupByUser, setGroupByUser] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [active, setActive] = useState(null);
  const [uploading, setUploading] = useState([]);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState("");
  const fileInput = useRef();
  const loadingMore = useRef(false);

  const [friends, setFriends] = useState([]);
  
  const isAdmin = group?.my_role === "admin";

  const loadGroup = async () => {
    try {
      const data = await api(`/groups/${groupId}`);
      setGroup(data);
      const friendsData = await api(`/friends`);
      setFriends(friendsData);
    } catch (e) {
      toast.error("Failed to load trip");
      nav("/dashboard");
    }
  };

  const loadMedia = async (reset = false) => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    try {
      const params = new URLSearchParams({ limit: 60, sort, filter_by: filter });
      if (!reset && cursor) params.append("cursor", cursor);
      if (q.trim()) params.append("search", q.trim());
      const data = await api(`/media/group/${groupId}?${params.toString()}`);
      setItems(reset ? data.items : [...items, ...data.items]);
      setCursor(data.next_cursor);
    } catch (e) { console.error(e); }
    finally { loadingMore.current = false; }
  };

  useEffect(() => { loadGroup(); }, [groupId]);
  useEffect(() => { setCursor(null); loadMedia(true); /* eslint-disable-next-line */ }, [groupId, filter, sort, q]);

  const handleFiles = async (files) => {
    const fileList = Array.from(files);
    const queue = fileList.map(f => ({ file: f, name: f.name, status: "pending", id: Math.random().toString(36).slice(2) }));
    setUploading(prev => [...prev, ...queue]);
    
    for (let i = 0; i < fileList.length; i++) {
      const qItem = queue[i];
      if (qItem.file.size > 5 * 1024 * 1024) {
        setUploading(prev => prev.map(x => x.id === qItem.id ? { ...x, status: "error", error: "File exceeds 5MB limit" } : x));
        continue;
      }
      setUploading(prev => prev.map(x => x.id === qItem.id ? { ...x, status: "uploading" } : x));
      
      try {
        // Resize image on client side to prevent backend Out-Of-Memory crashes
        const getResizedBase64 = async (file) => {
          if (!file.type.startsWith('image/')) {
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.readAsDataURL(file);
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
            });
          }

          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
              const img = new window.Image();
              img.src = e.target.result;
              img.onload = () => {
                const MAX_WIDTH = 1600;
                const MAX_HEIGHT = 1600;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                  if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                  }
                } else {
                  if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                  }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                // Compress to WebP or JPEG to save massive space
                resolve(canvas.toDataURL('image/webp', 0.8));
              };
              img.onerror = reject;
            };
            reader.onerror = reject;
          });
        };

        const base64Data = await getResizedBase64(qItem.file);

        // Send to base64 upload endpoint
        await api(`/media/upload-base64`, { 
          method: "POST", 
          body: {
            group_id: groupId,
            filename: qItem.name,
            content_type: qItem.file.type.startsWith('image/') ? 'image/webp' : (qItem.file.type || "application/octet-stream"),
            base64_data: base64Data
          }
        });
        
        setUploading(prev => prev.map(x => x.id === qItem.id ? { ...x, status: "done" } : x));
      } catch (e) {
        setUploading(prev => prev.map(x => x.id === qItem.id ? { ...x, status: "error", error: e.message || "Failed" } : x));
      }
    }
    setTimeout(() => setUploading(prev => prev.filter(x => x.status !== "done")), 1500);
    loadMedia(true);
    loadGroup();
  };

  const onDrop = (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); };

  const toggleSelect = (id) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleFav = async (id) => {
    try {
      const data = await api(`/favorites/${id}`, { method: "POST" });
      setItems(prev => prev.map(m => m.id === id ? { ...m, favorited: data.favorited } : m));
    } catch {}
  };

  const removeMedia = async (id) => {
    if (!window.confirm("Delete this media?")) return;
    try {
      await api(`/media/${id}`, { method: "DELETE" });
      setItems(prev => prev.filter(m => m.id !== id));
      setActive(null);
      toast.success("Deleted");
    } catch { toast.error("Failed"); }
  };

  const downloadOne = async (id, filename) => {
    try {
      const data = await api(`/media/${id}/download-url`);
      const a = document.createElement("a"); a.href = data.download_url; a.download = filename || id; a.click();
    } catch { toast.error("Download failed"); }
  };

  const downloadZip = async (ids) => {
    toast.info("Building zip…");
    try {
      let r;
      if (ids.length > 0) {
        r = await api(`/downloads/selected`, { method: "POST", body: { media_ids: ids } });
      } else {
        r = await api(`/downloads/group/${groupId}`, { method: "POST" });
      }
      toast.success("Background ZIP creation started. You will be notified when ready.");
    } catch { toast.error("Zip failed"); }
  };

  const sendInvite = async () => {
    if (!/^\d{6}$/.test(inviteCode)) { toast.error("Enter 6-digit code"); return; }
    try {
      await api(`/groups/${groupId}/invites`, { method: "POST", body: { friend_code: inviteCode } });
      toast.success("Invite sent");
      setInviteCode(""); setInviteOpen(false);
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  const removeMember = async (uid) => {
    if (!window.confirm("Remove this member from the trip?")) return;
    try { await api(`/groups/${groupId}/members/${uid}/remove`, { method: "POST" }); loadGroup(); toast.success("Removed"); }
    catch (e) { toast.error(e.message || "Failed"); }
  };

  const transferAdmin = async (uid) => {
    if (!window.confirm("Make this member an admin?")) return;
    try { await api(`/groups/${groupId}/admins/transfer?target_user_id=${uid}`, { method: "POST" }); loadGroup(); toast.success("Admin granted"); }
    catch { toast.error("Failed"); }
  };

  const deleteGroup = async () => {
    try {
      await api(`/groups/${groupId}`, { method: "DELETE" });
      toast.success("Trip deleted");
      nav("/dashboard");
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  if (!group) return <div className="min-h-screen"><Nav/><div className="p-10 label-caps text-muted-foreground">Loading…</div></div>;

  return (
    <div className="min-h-screen pb-20 md:pb-0" onDragOver={e => e.preventDefault()} onDrop={onDrop}>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-8">
          <div>
            <div className="label-caps text-muted-foreground mb-3 font-mono">{group.trip_date || "—"}</div>
            <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter" data-testid="group-title">{group.name}</h1>
            {group.description && <p className="text-sm text-muted-foreground mt-3 max-w-2xl">{group.description}</p>}
            <div className="flex flex-col gap-2 mt-6">
              <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                <span>{group.members?.length} members</span>
                <span>·</span>
                <span>{group.media_count} items</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full accent-bg" style={{ width: `${Math.min(100, (group.storage_used / group.storage_quota) * 100)}%` }} />
                </div>
                <span className="text-xs font-mono font-medium">
                  {(group.storage_used / 1024 / 1024).toFixed(1)} / {(group.storage_quota / 1024 / 1024 / 1024).toFixed(0)} GB Used
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <>
                <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="invite-member-btn" variant="outline" className="rounded-none h-10"><UserPlus size={14} strokeWidth={2} className="mr-2"/>Invite</Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-none border-border max-w-sm">
                    <DialogHeader><DialogTitle className="font-display font-black text-xl">Invite Friends</DialogTitle></DialogHeader>
                    <div className="flex flex-col gap-4 py-2 max-h-[300px] overflow-y-auto">
                      {friends.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">You have no friends yet.</p>
                      ) : (
                        friends.map(f => (
                          <div key={f.id} className="flex items-center justify-between p-2 border border-border/50 rounded-md">
                            <div>
                              <div className="font-bold text-sm">{f.name}</div>
                              <div className="text-xs text-muted-foreground font-mono">{f.friend_code}</div>
                            </div>
                            <Button size="sm" onClick={() => { setInviteCode(f.friend_code); setTimeout(sendInvite, 0); }} className="rounded-none accent-bg">Invite</Button>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="border-t border-border pt-4 mt-2">
                      <p className="text-xs text-muted-foreground mb-2">Or invite by code:</p>
                      <div className="flex gap-2">
                        <Input data-testid="invite-code-input" value={inviteCode} onChange={e => setInviteCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="rounded-none font-mono text-center flex-1"/>
                        <Button data-testid="invite-send-btn" onClick={sendInvite} className="rounded-none accent-bg hover:opacity-90">Send</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button data-testid="admin-settings-btn" variant="outline" onClick={() => setAdminOpen(true)} className="rounded-none h-10 w-10 p-0"><Settings size={14} strokeWidth={2}/></Button>
              </>
            )}
            <Button data-testid="upload-btn" onClick={() => fileInput.current?.click()} className="rounded-none accent-bg hover:opacity-90 h-10"><Upload size={14} strokeWidth={2} className="mr-2"/>Upload</Button>
            <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/heic,video/mp4,video/quicktime" hidden onChange={e => handleFiles(e.target.files)} data-testid="file-input"/>
          </div>
        </div>

        {/* Filter / sort / search */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList className="rounded-none border border-border bg-transparent p-0 h-10">
              {["all", "image", "video", "favorites"].map(k => (
                <TabsTrigger key={k} value={k} className="rounded-none label-caps data-[state=active]:accent-bg data-[state=active]:text-white px-4 h-full" data-testid={`filter-${k}`}>
                  {k === "image" ? "Photos" : k === "video" ? "Videos" : k === "favorites" ? "Favorites" : "All"}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="rounded-none w-36 h-10" data-testid="sort-select"><SelectValue/></SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
            </SelectContent>
          </Select>
          <Select value={groupByUser ? "user" : "all"} onValueChange={v => setGroupByUser(v === "user")}>
            <SelectTrigger className="rounded-none w-36 h-10"><SelectValue/></SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="user">Group by User</SelectItem>
              <SelectItem value="all">Mixed View</SelectItem>
            </SelectContent>
          </Select>
          <Input data-testid="search-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search filename or uploader…" className="rounded-none h-10 flex-1 min-w-[200px] max-w-xs"/>
          {selected.size > 0 && (
            <div className="flex gap-2 ml-auto">
              <span className="label-caps text-muted-foreground self-center">{selected.size} selected</span>
              <Button data-testid="download-selected" onClick={() => downloadZip(Array.from(selected))} className="rounded-none accent-bg hover:opacity-90 h-10"><Download size={14} strokeWidth={2} className="mr-2"/>Download</Button>
              <Button onClick={() => setSelected(new Set())} variant="outline" className="rounded-none h-10">Clear</Button>
            </div>
          )}
          {selected.size === 0 && items.length > 0 && (
            <Button data-testid="download-all" onClick={() => downloadZip([])} variant="outline" className="rounded-none h-10 ml-auto"><Download size={14} strokeWidth={2} className="mr-2"/>Album zip</Button>
          )}
        </div>

        {/* Upload status */}
        {uploading.length > 0 && (
          <div className="mb-6 border border-border p-4" data-testid="upload-status">
            <div className="label-caps mb-2">Uploading · {uploading.filter(x => x.status === "done").length}/{uploading.length}</div>
            <div className="space-y-1 text-xs font-mono max-h-32 overflow-y-auto">
              {uploading.map(u => (
                <div key={u.id} className="flex justify-between">
                  <span className="truncate flex-1">{u.name}</span>
                  <span className={u.status === "error" ? "accent-text" : "text-muted-foreground"}>{u.status === "error" ? u.error : u.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gallery */}
        {items.length === 0 ? (
          <div onClick={() => fileInput.current?.click()} className="border-2 border-dashed border-border/60 bg-muted/10 rounded-2xl p-24 text-center cursor-pointer hover:border-accent hover:bg-accent/5 transition-all group animate-in" data-testid="empty-gallery">
            <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300">
              <Upload size={32} strokeWidth={1.5} className="text-accent opacity-80"/>
            </div>
            <div className="font-display font-bold text-2xl mb-3 group-hover:text-accent transition-colors">Drop photos & videos here</div>
            <div className="text-sm text-muted-foreground max-w-sm mx-auto">Supports JPG, PNG, HEIC, MP4, MOV · up to 100MB each</div>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {Object.entries(
              items.reduce((acc, m) => {
                const groupName = groupByUser ? (m.uploader?.name || "Unknown") : "All Photos";
                if (!acc[groupName]) acc[groupName] = [];
                acc[groupName].push(m);
                return acc;
              }, {})
            ).map(([groupName, groupItems]) => (
              <div key={groupName} className="animate-in">
                {groupByUser && (
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-xl font-display font-bold">📸 Uploaded by {groupName}</h2>
                    <span className="bg-muted text-muted-foreground text-xs font-bold px-2 py-0.5 rounded-full">{groupItems.length} items</span>
                  </div>
                )}
                <div className="grid-photos" data-testid={`gallery-grid-${groupName}`}>
                  {groupItems.map(m => (
                    <div key={m.id} className="group relative aspect-square bg-muted/50 overflow-hidden cursor-pointer shadow-sm hover:shadow-lg transition-all rounded-md" data-testid={`media-${m.id}`} onClick={() => setActive(m)}>
                      <img src={mediaFileUrl ? mediaFileUrl(m.id) : ""} alt={m.filename} loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"/>
                      {m.media_type === "video" && (
                        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 z-10">
                          <Play size={10} strokeWidth={3} className="text-white"/> Video
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"/>
                      <button onClick={e => { e.stopPropagation(); toggleSelect(m.id); }} className={`absolute top-3 left-3 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all z-20 ${selected.has(m.id) ? "accent-bg border-transparent scale-110 shadow-md" : "border-white/80 bg-black/30 opacity-0 group-hover:opacity-100 hover:scale-110"}`} data-testid={`select-${m.id}`}>
                        {selected.has(m.id) && <Check size={14} strokeWidth={3} className="text-white"/>}
                      </button>
                      <button onClick={e => { e.stopPropagation(); toggleFav(m.id); }} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-20 hover:scale-110" data-testid={`fav-${m.id}`}>
                        <Heart size={16} strokeWidth={2.5} className={m.favorited ? "fill-red-500 text-red-500" : "text-white"}/>
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 p-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end">
                        <div className="text-xs font-medium text-white truncate max-w-full drop-shadow-md">{m.filename}</div>
                        {!groupByUser && <div className="text-[10px] text-white/70 truncate drop-shadow-md mt-0.5">by {m.uploader?.name}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {cursor && (
              <div className="flex justify-center mt-8">
                <Button data-testid="load-more" onClick={() => loadMedia(false)} variant="outline" className="rounded-none">Load more</Button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Lightbox */}
      {active && (
        <div className="fixed inset-0 z-50 bg-black/98 flex items-center justify-center" onClick={() => setActive(null)} data-testid="lightbox">
          <button onClick={() => setActive(null)} className="absolute top-6 right-6 w-10 h-10 border border-white/40 flex items-center justify-center text-white hover:border-white" data-testid="lightbox-close"><X size={18}/></button>
          <div className="absolute top-6 left-6 text-white">
            <div className="label-caps text-white/60 mb-1">{active.uploader?.name}</div>
            <div className="font-mono text-xs text-white/80">{new Date(active.uploaded_at).toLocaleString()}</div>
          </div>
          <div className="max-w-[90vw] max-h-[85vh]" onClick={e => e.stopPropagation()}>
            {active.media_type === "video" ? (
              <video src={mediaFileUrl ? mediaFileUrl(active.id) : ""} controls autoPlay className="max-w-full max-h-[85vh]"/>
            ) : (
              <img src={mediaFileUrl ? mediaFileUrl(active.id) : ""} alt={active.filename} className="max-w-full max-h-[85vh] object-contain"/>
            )}
          </div>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2" onClick={e => e.stopPropagation()}>
            <button onClick={() => toggleFav(active.id).then(() => setActive(prev => ({ ...prev, favorited: !prev.favorited })))} className="px-4 h-10 border border-white/40 text-white flex items-center gap-2 hover:border-white" data-testid="lightbox-fav">
              <Heart size={14} className={active.favorited ? "fill-current accent-text" : ""}/> {active.favorited ? "Favorited" : "Favorite"}
            </button>
            <button onClick={() => downloadOne(active.id, active.filename)} className="px-4 h-10 border border-white/40 text-white flex items-center gap-2 hover:border-white" data-testid="lightbox-download"><Download size={14}/> Download</button>
            {(isAdmin || active.uploader_id === user?.user_id) && (
              <button onClick={() => removeMedia(active.id)} className="px-4 h-10 border border-white/40 text-white flex items-center gap-2 hover:accent-border" data-testid="lightbox-delete"><Trash2 size={14}/> Delete</button>
            )}
          </div>
        </div>
      )}

      {/* Admin panel */}
      <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
        <DialogContent className="rounded-none border-border max-w-lg" data-testid="admin-panel">
          <DialogHeader><DialogTitle className="font-display font-black text-2xl">Trip admin</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            <div className="label-caps text-muted-foreground">Members</div>
            {group.members?.map(m => (
              <div key={m.user_id} className="flex items-center justify-between border border-border p-3">
                <div className="flex items-center gap-3">
                  {m.user?.picture && <img src={m.user.picture} alt="" className="w-8 h-8 object-cover border border-border"/>}
                  <div>
                    <div className="font-bold text-sm">{m.user?.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{m.role.toUpperCase()}</div>
                  </div>
                </div>
                {m.user_id !== user?.user_id && (
                  <div className="flex gap-1">
                    {m.role !== "admin" && <Button onClick={() => transferAdmin(m.user_id)} variant="outline" className="rounded-none h-8 text-xs" data-testid={`make-admin-${m.user_id}`}>Promote</Button>}
                    <Button onClick={() => removeMember(m.user_id)} variant="outline" className="rounded-none h-8 text-xs" data-testid={`remove-member-${m.user_id}`}>Remove</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="hairline-t pt-4 mt-4">
            <div className="label-caps accent-text mb-2">Danger zone</div>
            <Label className="text-xs text-muted-foreground">Type "<span className="font-mono">{group.name}</span>" to confirm deletion</Label>
            <Input value={delConfirm} onChange={e => setDelConfirm(e.target.value)} className="rounded-none mt-2 font-mono" data-testid="delete-confirm-input"/>
            <Button onClick={deleteGroup} disabled={delConfirm !== group.name} className="rounded-none accent-bg hover:opacity-90 mt-3 w-full" data-testid="delete-group-btn">Delete trip permanently</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
