import { useEffect, useMemo, useState, useRef } from 'react'
import { api } from './api'

function useToken() {
  const [token, setToken] = useState(() => localStorage.getItem('access_token') ?? '')
  const save = (next) => {
    if (next) {
      localStorage.setItem('access_token', next)
    } else {
      localStorage.removeItem('access_token')
    }
    setToken(next)
  }
  return [token, save]
}

export default function App() {
  const [token, setToken] = useToken()
  const [me, setMe] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [groups, setGroups] = useState([])
  const [media, setMedia] = useState([])
  const [selectedGroup, setSelectedGroup] = useState('')
  const [groupDetails, setGroupDetails] = useState(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') ?? 'dark')

  // UI state variables
  const [friends, setFriends] = useState([])
  const [friendInbox, setFriendInbox] = useState([])
  const [groupInvites, setGroupInvites] = useState([])
  const [notifications, setNotifications] = useState([])
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [currentView, setCurrentView] = useState('gallery') // gallery | upload | admin | share

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('all') // all | photos | videos | favorites
  const [sortOrder, setSortOrder] = useState('newest') // newest | oldest
  const [nextCursor, setNextCursor] = useState(null)

  // Selection state
  const [selectedMediaIds, setSelectedMediaIds] = useState([])
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)

  // Lightbox
  const [activeMediaItem, setActiveMediaItem] = useState(null)

  // ZIP download jobs
  const [runningZipJobs, setRunningZipJobs] = useState([])

  // Upload progress tracking
  const [uploadQueue, setUploadQueue] = useState([]) // list of { id, name, progress, status }

  // Share links generated
  const [shareLinks, setShareLinks] = useState([])

  // Public shared token
  const [shareToken, setShareToken] = useState(() => {
    return new URLSearchParams(window.location.search).get('share') ?? ''
  })

  // Theme support
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') {
      root.classList.add('light-theme')
    } else {
      root.classList.remove('light-theme')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  // Notifications polling
  useEffect(() => {
    if (!token) return
    const fetchNotifications = async () => {
      try {
        const notifs = await api('/notifications', { token })
        setNotifications(notifs)
        const countRes = await api('/notifications/unread-count', { token })
        setUnreadNotificationsCount(countRes.count)
      } catch (e) {
        console.error(e)
      }
    }
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 8000)
    return () => clearInterval(interval)
  }, [token])

  // Loading profile and groups
  const loadMe = async () => {
    if (!token) return
    try {
      const data = await api('/auth/me', { token })
      setMe(data)
      const gs = await api('/groups', { token })
      setGroups(gs)
      if (gs.length > 0 && !selectedGroup) {
        setSelectedGroup(gs[0].id)
      }

      // Load friends and requests
      const fList = await api('/friends', { token })
      setFriends(fList)
      const fInbox = await api('/friends/requests/inbox', { token })
      setFriendInbox(fInbox)

      // Load group invites
      const gInvites = await api('/groups/invites/inbox', { token })
      setGroupInvites(gInvites)
    } catch (e) {
      if (e.message.includes('401') || e.message.includes('token')) {
        setToken('')
      } else {
        setError(e.message)
      }
    }
  }

  useEffect(() => {
    loadMe().catch((e) => setError(e.message))
  }, [token])

  // Fetching media when group, filters, search changes
  const loadMedia = async (clear = true) => {
    if (!token || !selectedGroup) return
    try {
      const cursorParam = !clear && nextCursor ? `&cursor=${nextCursor}` : ''
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''
      const res = await api(`/media/group/${selectedGroup}?limit=30&sort=${sortOrder}&filter_by=${filterType}${cursorParam}${searchParam}`, { token })
      if (clear) {
        setMedia(res.items)
      } else {
        setMedia((prev) => [...prev, ...res.items])
      }
      setNextCursor(res.next_cursor)
    } catch (e) {
      setError(e.message)
    }
  }

  // Fetch group details
  const loadGroupDetails = async () => {
    if (!token || !selectedGroup) return
    try {
      const details = await api(`/groups/${selectedGroup}`, { token })
      setGroupDetails(details)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    loadMedia(true)
    loadGroupDetails()
    setSelectedMediaIds([])
    setIsMultiSelectMode(false)
  }, [token, selectedGroup, filterType, sortOrder, searchQuery])

  // Auth Submit
  async function submitAuth(formData, path) {
    setError('')
    setMessage('')
    try {
      const data = await api(path, { method: 'POST', body: formData })
      setToken(data.access_token)
      // Extract csrf token cookie if present
      const csrf = document.cookie.split('; ').find((p) => p.startsWith('csrf_token='))?.split('=')[1] ?? ''
      localStorage.setItem('csrf_token', csrf)
      setMessage('Welcome to TripShare!')
    } catch (e) {
      setError(e.message)
    }
  }

  // Group Create
  async function createGroup(event) {
    event.preventDefault()
    const formEl = event.currentTarget
    const form = new FormData(formEl)
    const payload = Object.fromEntries(form.entries())
    try {
      const newG = await api('/groups', { method: 'POST', body: payload, token })
      setMessage('Group created successfully')
      formEl.reset()
      await loadMe()
      setSelectedGroup(newG.id)
    } catch (e) {
      setError(e.message)
    }
  }

  // Friend Request Action
  async function sendFriendRequest(event) {
    event.preventDefault()
    const formEl = event.currentTarget
    const code = new FormData(formEl).get('friend_code')
    try {
      await api('/friends/requests', { method: 'POST', body: { friend_code: code }, token })
      setMessage('Friend request sent!')
      formEl.reset()
      await loadMe()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleFriendRequest(requestId, action) {
    try {
      await api(`/friends/requests/${requestId}/${action}`, { method: 'POST', token })
      setMessage(`Friend request ${action}ed`)
      await loadMe()
    } catch (e) {
      setError(e.message)
    }
  }

  // Group Invite Accept/Decline
  async function handleGroupInvite(inviteId, action) {
    try {
      await api(`/groups/invites/${inviteId}/${action}`, { method: 'POST', token })
      setMessage(`Group invite ${action}ed`)
      await loadMe()
    } catch (e) {
      setError(e.message)
    }
  }

  // Favorites Toggle
  async function toggleFavorite(mediaId, event) {
    if (event) event.stopPropagation()
    try {
      const res = await api(`/favorites/${mediaId}`, { method: 'POST', token })
      if (activeMediaItem && activeMediaItem.id === mediaId) {
        setActiveMediaItem((prev) => ({ ...prev, favorited: res.favorited }))
      }
      loadMedia(true)
    } catch (e) {
      setError(e.message)
    }
  }

  // Media Deletion
  async function deleteMediaItem(mediaId) {
    if (!confirm('Are you sure you want to delete this media item? It will be soft-deleted.')) return
    try {
      await api(`/media/${mediaId}`, { method: 'DELETE', token })
      setMessage('Media soft-deleted successfully')
      setActiveMediaItem(null)
      loadMedia(true)
    } catch (e) {
      setError(e.message)
    }
  }

  // Duplicate Resolution
  async function handleResolveDuplicate(mediaId, action, keepId = null) {
    try {
      await api(`/media/${mediaId}/resolve-duplicate`, {
        method: 'POST',
        body: { action, keep_id: keepId },
        token,
      })
      setMessage(`Duplicate resolved via: ${action}`)
      setActiveMediaItem(null)
      loadMedia(true)
    } catch (e) {
      setError(e.message)
    }
  }

  // Helper: read a file as base64 data URI
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  // Max file size: 5MB
  const MAX_FILE_SIZE = 5 * 1024 * 1024

  // Multi-File Upload via Base64
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || event.dataTransfer.files)
    if (files.length === 0 || !selectedGroup) return

    // Initialize state
    const newItems = files.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      file: f,
      name: f.name,
      progress: 0,
      status: 'pending',
    }))
    setUploadQueue((prev) => [...prev, ...newItems])

    for (const item of newItems) {
      try {
        // Validate file size
        if (item.file.size > MAX_FILE_SIZE) {
          setUploadQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: 'failed' } : q))
          )
          setError(`File "${item.name}" exceeds 5MB limit. Please resize before uploading.`)
          continue
        }

        setUploadQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading', progress: 30 } : q))
        )

        // Read file as base64
        const base64Data = await fileToBase64(item.file)

        setUploadQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, progress: 60 } : q))
        )

        // Upload base64 to backend
        await api('/media/upload-base64', {
          method: 'POST',
          token,
          body: {
            group_id: selectedGroup,
            filename: item.file.name,
            content_type: item.file.type || 'application/octet-stream',
            base64_data: base64Data,
          },
        })

        setUploadQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'success', progress: 100 } : q))
        )
      } catch (e) {
        console.error(e)
        setUploadQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'failed' } : q))
        )
      }
    }
    // Refresh group media & metadata (quota)
    loadMedia(true)
    loadGroupDetails()
  }

  // Retry failed upload
  const retryUpload = async (queueId) => {
    const queueItem = uploadQueue.find((q) => q.id === queueId)
    if (!queueItem) return

    // Clear failure status
    setUploadQueue((prev) =>
      prev.map((q) => (q.id === queueId ? { ...q, status: 'uploading', progress: 0 } : q))
    )

    try {
      if (queueItem.file.size > MAX_FILE_SIZE) {
        setError(`File "${queueItem.name}" exceeds 5MB limit.`)
        setUploadQueue((prev) =>
          prev.map((q) => (q.id === queueId ? { ...q, status: 'failed' } : q))
        )
        return
      }

      const base64Data = await fileToBase64(queueItem.file)

      setUploadQueue((prev) =>
        prev.map((q) => (q.id === queueId ? { ...q, progress: 60 } : q))
      )

      await api('/media/upload-base64', {
        method: 'POST',
        token,
        body: {
          group_id: selectedGroup,
          filename: queueItem.file.name,
          content_type: queueItem.file.type || 'application/octet-stream',
          base64_data: base64Data,
        },
      })

      setUploadQueue((prev) =>
        prev.map((q) => (q.id === queueId ? { ...q, status: 'success', progress: 100 } : q))
      )
    } catch (e) {
      console.error(e)
      setUploadQueue((prev) =>
        prev.map((q) => (q.id === queueId ? { ...q, status: 'failed' } : q))
      )
    }
    loadMedia(true)
    loadGroupDetails()
  }

  // Share Links administration
  async function generateShareLink(event) {
    event.preventDefault()
    const formEl = event.currentTarget
    const form = new FormData(formEl)
    const password = form.get('password') || null
    const expires_in_hours = parseInt(form.get('expiry') || '0') || null
    try {
      const res = await api(`/groups/${selectedGroup}/share-links`, {
        method: 'POST',
        body: { password, expires_in_hours },
        token,
      })
      const fullUrl = `${window.location.origin}${window.location.pathname}?share=${res.token}`
      setShareLinks((prev) => [
        { token: res.token, url: fullUrl, expires_at: res.expires_at, password },
        ...prev,
      ])
      setMessage('Public share link generated successfully!')
      formEl.reset()
    } catch (e) {
      setError(e.message)
    }
  }

  // Remove group member (with keep media choice)
  async function handleRemoveMember(memberUserId, keepMedia) {
    if (!confirm('Are you sure you want to remove this member from the group?')) return
    try {
      await api(`/groups/${selectedGroup}/members/${memberUserId}/remove?keep_media=${keepMedia}`, {
        method: 'POST',
        token,
      })
      setMessage('Member removed successfully')
      loadGroupDetails()
      loadMedia(true)
    } catch (e) {
      setError(e.message)
    }
  }

  // Transfer admin role
  async function handleTransferAdmin(targetUserId) {
    if (!confirm('Are you sure you want to transfer your Admin role? You will become a regular Member.')) return
    try {
      await api(`/groups/${selectedGroup}/admins/transfer?target_user_id=${targetUserId}`, {
        method: 'POST',
        token,
      })
      setMessage('Admin role transferred successfully')
      loadGroupDetails()
      loadMe()
    } catch (e) {
      setError(e.message)
    }
  }

  // Invite member by code
  async function inviteMemberByCode(event) {
    event.preventDefault()
    const formEl = event.currentTarget
    const code = new FormData(formEl).get('friend_code')
    try {
      await api(`/groups/${selectedGroup}/invites`, {
        method: 'POST',
        body: { friend_code: code },
        token,
      })
      setMessage('Invitation sent to friend!')
      formEl.reset()
    } catch (e) {
      setError(e.message)
    }
  }

  // Delete Group completely
  async function handleDeleteGroup(event) {
    event.preventDefault()
    const nameInput = new FormData(event.currentTarget).get('group_name')
    if (nameInput !== groupDetails?.name) {
      setError('Group name mismatch. Deletion cancelled.')
      return
    }
    if (!confirm('WARNING: This will permanently delete the group, members, invites, and ALL media. Are you absolutely sure?')) return
    try {
      await api(`/groups/${selectedGroup}`, { method: 'DELETE', token })
      setMessage('Group deleted and background cleanup queued')
      setSelectedGroup('')
      setGroupDetails(null)
      await loadMe()
    } catch (e) {
      setError(e.message)
    }
  }

  // ZIP download trigger
  async function startZipDownload(selectionOnly = false) {
    try {
      let res
      if (selectionOnly) {
        res = await api('/downloads/selected', {
          method: 'POST',
          body: { media_ids: selectedMediaIds },
          token,
        })
      } else {
        res = await api(`/downloads/group/${selectedGroup}`, {
          method: 'POST',
          token,
        })
      }
      setMessage('Background ZIP creation started. You will be notified when ready.')
      setRunningZipJobs((prev) => [...prev, { id: res.job_id, progress: 'queued', downloadUrl: null }])
    } catch (e) {
      setError(e.message)
    }
  }

  // Zip jobs checker
  useEffect(() => {
    if (runningZipJobs.length === 0 || !token) return
    const checkJobs = async () => {
      const nextJobs = []
      for (const job of runningZipJobs) {
        if (job.status === 'completed' || job.status === 'failed') {
          nextJobs.push(job)
          continue
        }
        try {
          const statusRes = await api(`/downloads/jobs/${job.id}`, { token })
          if (statusRes.status === 'completed') {
            const resData = JSON.parse(statusRes.result)
            const downUrl = `${import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'}/storage/download/${resData.download_path}`
            // Try fetch storage scoped url
            const scopedUrlRes = await api(`/media/group/${selectedGroup}`, { token }) // dummy request to verify connection

            // Build full download URL
            const finalUrl = `${import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'}/storage/download/${resData.download_path.replace('downloads/', '')}`

            nextJobs.push({ ...job, status: 'completed', downloadUrl: finalUrl })
            setMessage(`ZIP Download ready!`)
          } else if (statusRes.status === 'failed') {
            nextJobs.push({ ...job, status: 'failed' })
            setError('ZIP generation failed')
          } else {
            nextJobs.push({ ...job, status: 'running' })
          }
        } catch (e) {
          console.error(e)
          nextJobs.push(job)
        }
      }
      setRunningZipJobs(nextJobs)
    }
    const interval = setInterval(checkJobs, 4000)
    return () => clearInterval(interval)
  }, [runningZipJobs, token])

  // Single Item Download Trigger
  async function handleSingleDownload(item) {
    try {
      const res = await api(`/media/${item.id}/download-url`, { token })
      window.open(res.download_url, '_blank')
    } catch (e) {
      setError(e.message)
    }
  }

  // Group chronologically
  const chronologicalMediaGroups = useMemo(() => {
    const groupsMap = {}
    media.forEach((item) => {
      const dateStr = new Date(item.uploaded_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      if (!groupsMap[dateStr]) groupsMap[dateStr] = []
      groupsMap[dateStr].push(item)
    })
    return Object.entries(groupsMap)
  }, [media])

  // Mark all notifications as read
  async function markAllNotificationsRead() {
    try {
      await api('/notifications/read-all', { method: 'POST', token })
      setUnreadNotificationsCount(0)
      const notifs = await api('/notifications', { token })
      setNotifications(notifs)
    } catch (e) {
      setError(e.message)
    }
  }

  // Toggle selection
  const toggleSelectMedia = (id, event) => {
    event.stopPropagation()
    setSelectedMediaIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id)
      } else {
        return [...prev, id]
      }
    })
  }

  // If share token is present in the url, render Public Shared Gallery
  if (shareToken) {
    return <PublicGallery shareToken={shareToken} onClose={() => {
      setShareToken('')
      window.history.replaceState(null, '', window.location.pathname)
    }} />
  }

  // Unauthenticated view
  if (!token) {
    return <Auth onAuth={submitAuth} error={error} />
  }

  // Admin user check for active group
  const isGroupAdmin = groupDetails?.members?.some(
    (m) => m.user_id === me?.id && m.role === 'admin'
  )

  // Calculate Group Quota usage
  const quotaUsagePct = groupDetails
    ? Math.min(
      100,
      Math.round(
        (media.reduce((acc, item) => acc + item.size_bytes, 0) /
          (5 * 1024 * 1024 * 1024)) *
        100
      )
    )
    : 0

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="navbar glass">
        <div className="brand-section">
          <div className="brand-logo">TripShare</div>
          <span style={{ opacity: 0.3 }}>|</span>
          <select
            className="input-field"
            style={{ width: 'auto', padding: '6px 12px', border: 'none', background: 'rgba(255,255,255,0.05)' }}
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className="nav-actions">
          {/* Notifications Trigger */}
          <div className="notification-bell glass" style={{ padding: '8px 12px', borderRadius: '12px' }} onClick={() => setShowNotifications(!showNotifications)}>
            🔔 {unreadNotificationsCount > 0 && <span className="notification-badge">{unreadNotificationsCount}</span>}
          </div>

          <button className="btn-secondary" onClick={() => setShowProfileModal(true)}>
            👤 {me?.name}
          </button>

          <button className="btn-secondary" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          <button
            className="btn-secondary"
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}
            onClick={async () => {
              try {
                await api('/auth/logout', { method: 'POST', token })
              } catch (e) { }
              localStorage.clear()
              setToken('')
            }}
          >
            Log out
          </button>
        </div>
      </header>

      {/* Global Message / Error alerts */}
      {error && (
        <div className="glass" style={{ margin: '16px 24px 0', padding: '16px', background: 'rgba(239,68,68,0.1)', borderColor: 'var(--danger)', display: 'flex', justifyContent: 'space-between' }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}
      {message && (
        <div className="glass" style={{ margin: '16px 24px 0', padding: '16px', background: 'rgba(16,185,129,0.1)', borderColor: 'var(--success)', display: 'flex', justifyContent: 'space-between' }}>
          <span>✅ {message}</span>
          <button onClick={() => setMessage('')}>✕</button>
        </div>
      )}

      {/* Notifications Drawer */}
      {showNotifications && (
        <div className="modal-overlay" onClick={() => setShowNotifications(false)}>
          <div className="glass widget-card" style={{ width: '400px', maxHeight: '80vh', overflowY: 'auto', position: 'absolute', right: '24px', top: '80px', zIndex: 100 }} onClick={(e) => e.stopPropagation()}>
            <div className="widget-title">
              <span>Notifications ({unreadNotificationsCount} unread)</span>
              <button className="btn-secondary" style={{ fontSize: '12px' }} onClick={markAllNotificationsRead}>Mark all read</button>
            </div>
            <div className="stack" style={{ gap: '8px' }}>
              {notifications.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', padding: '16px', textAlign: 'center' }}>No notifications yet</div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} style={{ padding: '12px', background: n.read_at ? 'transparent' : 'rgba(124,58,237,0.06)', borderRadius: '10px', border: '1px solid var(--border-card)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '13px' }}>
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
        </div>
      )}

      {/* Profile Edit Modal */}
      {showProfileModal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="glass widget-card" style={{ width: '450px' }} onClick={(e) => e.stopPropagation()}>
            <div className="widget-title">
              <span>Edit Profile & Preferences</span>
              <button onClick={() => setShowProfileModal(false)}>✕</button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              try {
                await api('/auth/me', {
                  method: 'PATCH',
                  token,
                  body: {
                    name: f.get('name'),
                    email_notifications_enabled: f.get('email_notifs') === 'true',
                  }
                })
                setMessage('Profile updated successfully')
                setShowProfileModal(false)
                await loadMe()
              } catch (err) {
                setError(err.message)
              }
            }} className="stack">
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Full Name</label>
                <input name="name" className="input-field" defaultValue={me?.name} required />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Email</label>
                <input className="input-field" value={me?.email} disabled style={{ opacity: 0.6 }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Your Friend Code (Share this with friends)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input className="input-field" value={me?.friend_code} readOnly style={{ fontWeight: 'bold', fontSize: '18px', textAlign: 'center', letterSpacing: '4px' }} />
                  <button type="button" className="btn-secondary" onClick={() => {
                    navigator.clipboard.writeText(me?.friend_code)
                    setMessage('Friend code copied to clipboard!')
                  }}>Copy</button>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Email digest notifications</label>
                <select name="email_notifs" className="input-field" defaultValue={me?.email_notifications_enabled ? 'true' : 'false'}>
                  <option value="false">Opt-out (In-app only)</option>
                  <option value="true">Opt-in (Receive digest summaries)</option>
                </select>
              </div>
              <button className="btn-primary">Save Changes</button>
            </form>
          </div>
        </div>
      )}

      {/* Main Grid View */}
      <main className="dashboard-grid">
        {/* Sidebar Panel */}
        <section className="sidebar">
          {/* Quick Stats & Quota info */}
          {groupDetails && (
            <div className="glass widget-card">
              <div className="widget-title">Group: {groupDetails.name}</div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                {groupDetails.description}
              </p>
              <div className="quota-display">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Trip Date: {groupDetails.trip_date}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                  <span>Storage Quota</span>
                  <span>{quotaUsagePct}% used</span>
                </div>
                <div className="quota-bar">
                  <div className="quota-fill" style={{ width: `${quotaUsagePct}%` }}></div>
                </div>
              </div>
            </div>
          )}

          {/* Group invites pending notification */}
          {groupInvites.length > 0 && (
            <div className="glass widget-card" style={{ borderColor: 'var(--warning)', background: 'rgba(245,158,11,0.05)' }}>
              <div className="widget-title" style={{ color: 'var(--warning)' }}>Group Invitations ({groupInvites.length})</div>
              <div className="stack" style={{ gap: '8px' }}>
                {groupInvites.map((inv) => (
                  <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.1)', padding: '8px 12px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '13px' }}>Trip Group invitation</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', background: 'rgba(16,185,129,0.2)' }} onClick={() => handleGroupInvite(inv.id, 'accept')}>Accept</button>
                      <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', background: 'rgba(239,68,68,0.2)' }} onClick={() => handleGroupInvite(inv.id, 'decline')}>Decline</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Views Selector Menu */}
          <div className="glass widget-card" style={{ padding: '8px' }}>
            <button className="btn-secondary" style={{ width: '100%', textAlign: 'left', background: currentView === 'gallery' ? 'var(--accent)' : 'transparent', color: currentView === 'gallery' ? '#fff' : 'inherit', marginBottom: '4px' }} onClick={() => setCurrentView('gallery')}>
              🖼️ Shared Gallery
            </button>
            <button className="btn-secondary" style={{ width: '100%', textAlign: 'left', background: currentView === 'upload' ? 'var(--accent)' : 'transparent', color: currentView === 'upload' ? '#fff' : 'inherit', marginBottom: '4px' }} onClick={() => setCurrentView('upload')}>
              📤 Upload Media
            </button>
            <button className="btn-secondary" style={{ width: '100%', textAlign: 'left', background: currentView === 'share' ? 'var(--accent)' : 'transparent', color: currentView === 'share' ? '#fff' : 'inherit', marginBottom: '4px' }} onClick={() => setCurrentView('share')}>
              🔗 Share Settings
            </button>
            {isGroupAdmin && (
              <button className="btn-secondary" style={{ width: '100%', textAlign: 'left', background: currentView === 'admin' ? 'var(--accent)' : 'transparent', color: currentView === 'admin' ? '#fff' : 'inherit' }} onClick={() => setCurrentView('admin')}>
                ⚙️ Admin Controls
              </button>
            )}
          </div>

          {/* Friends List & Requests lookup */}
          <div className="glass widget-card">
            <div className="widget-title">Friends & Invites</div>
            <form onSubmit={sendFriendRequest} className="stack" style={{ marginBottom: '16px' }}>
              <input name="friend_code" className="input-field" placeholder="Enter 6-digit code to add" required pattern="\d{6}" maxLength={6} />
              <button className="btn-primary" style={{ padding: '8px' }}>Add Friend</button>
            </form>

            {/* Friend requests inbox */}
            {friendInbox.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Pending Requests ({friendInbox.length})</div>
                <div className="stack" style={{ gap: '6px' }}>
                  {friendInbox.map((req) => (
                    <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '10px' }}>
                      <span style={{ fontSize: '12px' }}>Code: {req.sender_id.substring(0, 8)}...</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn-secondary" style={{ padding: '4px 6px', fontSize: '10px' }} onClick={() => handleFriendRequest(req.id, 'accept')}>Accept</button>
                        <button className="btn-secondary" style={{ padding: '4px 6px', fontSize: '10px' }} onClick={() => handleFriendRequest(req.id, 'decline')}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>My Friends List ({friends.length})</div>
              <div className="stack" style={{ gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                {friends.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>No friends added yet</div>
                ) : (
                  friends.map((f) => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                      <span>👤</span>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '500' }}>{f.name}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Code: {f.friend_code}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Group Creation box */}
          <div className="glass widget-card">
            <div className="widget-title">Start a New Trip Group</div>
            <form onSubmit={createGroup} className="stack">
              <input name="name" className="input-field" placeholder="Trip/Group Name" required />
              <input name="description" className="input-field" placeholder="Short description" required />
              <input name="trip_date" className="input-field" type="date" required />
              <button className="btn-primary" style={{ padding: '10px' }}>Create Group</button>
            </form>
          </div>
        </section>

        {/* Dynamic content center panel */}
        <section className="gallery-section">
          {/* Active Zip download downloads widget */}
          {runningZipJobs.length > 0 && (
            <div className="glass widget-card" style={{ borderColor: 'var(--accent)', background: 'rgba(124,58,237,0.05)' }}>
              <div className="widget-title">Background Export Jobs ({runningZipJobs.length})</div>
              <div className="stack" style={{ gap: '8px' }}>
                {runningZipJobs.map((job) => (
                  <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '10px 14px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '13px' }}>ZIP Generation status: <strong>{job.status || 'processing'}</strong></span>
                    {job.downloadUrl ? (
                      <a href={job.downloadUrl} className="btn-primary" style={{ textDecoration: 'none', fontSize: '12px', padding: '6px 12px' }} download>Download ZIP</a>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Building archive...</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* View: Shared Gallery */}
          {currentView === 'gallery' && (
            <>
              {/* Filter controls */}
              <div className="gallery-header glass" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '12px', flex: 1, minWidth: '280px' }}>
                    <input
                      className="input-field"
                      placeholder="🔍 Search files or uploader name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ padding: '8px 16px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      className="input-field"
                      style={{ width: 'auto', padding: '8px 12px' }}
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value)}
                    >
                      <option value="newest">Newest Uploads</option>
                      <option value="oldest">Oldest Uploads</option>
                    </select>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setIsMultiSelectMode(!isMultiSelectMode)
                        setSelectedMediaIds([])
                      }}
                    >
                      {isMultiSelectMode ? 'Cancel Selection' : 'Multi-Select'}
                    </button>
                    {isMultiSelectMode && selectedMediaIds.length > 0 && (
                      <button className="btn-primary" style={{ padding: '8px 16px' }} onClick={() => startZipDownload(true)}>
                        Download Selected ({selectedMediaIds.length})
                      </button>
                    )}
                    <button className="btn-secondary" onClick={() => startZipDownload(false)}>
                      Export Entire Group ZIP
                    </button>
                  </div>
                </div>

                <div className="gallery-filters">
                  <div className={`filter-chip ${filterType === 'all' ? 'active' : ''}`} onClick={() => setFilterType('all')}>All</div>
                  <div className={`filter-chip ${filterType === 'photos' ? 'active' : ''}`} onClick={() => setFilterType('photos')}>Photos</div>
                  <div className={`filter-chip ${filterType === 'videos' ? 'active' : ''}`} onClick={() => setFilterType('videos')}>Videos</div>
                  <div className={`filter-chip ${filterType === 'favorites' ? 'active' : ''}`} onClick={() => setFilterType('favorites')}>Favorites</div>
                </div>
              </div>

              {/* Photos chronologically timeline */}
              {media.length === 0 ? (
                <div className="glass" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <h3>No media matches filters</h3>
                  <p>Be the first to upload group photos or videos!</p>
                </div>
              ) : (
                chronologicalMediaGroups.map(([dateStr, items]) => (
                  <div key={dateStr} className="timeline-group">
                    <div className="timeline-date">{dateStr}</div>
                    <div className="media-grid">
                      {items.map((item) => {
                        const isSelected = selectedMediaIds.includes(item.id)
                        const fullThumbUrl = item.thumbnail_url || item.download_url
                        return (
                          <div key={item.id} className="media-tile" onClick={() => {
                            if (isMultiSelectMode) {
                              toggleSelectMedia(item.id, { stopPropagation: () => { } })
                            } else {
                              setActiveMediaItem(item)
                            }
                          }}>
                            {/* Checkbox for select */}
                            {isMultiSelectMode && (
                              <div
                                className={`tile-select-checkbox ${isSelected ? 'selected' : ''}`}
                                onClick={(e) => toggleSelectMedia(item.id, e)}
                              ></div>
                            )}

                            {/* Favorite Heart Badge */}
                            {item.favorited && <span className="fav-badge">❤️</span>}

                            {/* Image Thumbnail */}
                            <img
                              className="media-thumbnail"
                              src={fullThumbUrl}
                              alt={item.original_filename}
                              loading="lazy"
                            />

                            {/* Video duration badge */}
                            {item.media_type === 'video' && (
                              <div className="video-badge">
                                📹 video
                              </div>
                            )}

                            {/* Info overlay on hover */}
                            <div className="media-overlay">
                              <div className="media-title">{item.original_filename}</div>
                              <div className="media-meta">
                                <span>{Math.round(item.size_bytes / (1024 * 1024) * 10) / 10} MB</span>
                                <span onClick={(e) => toggleFavorite(item.id, e)} style={{ cursor: 'pointer' }}>
                                  {item.favorited ? '❤️' : '🤍'}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}

              {/* Load more cursor pagination */}
              {nextCursor && (
                <button className="btn-secondary" style={{ width: '150px', alignSelf: 'center', marginTop: '16px' }} onClick={() => loadMedia(false)}>
                  Load More
                </button>
              )}
            </>
          )}

          {/* View: Upload Files Dropzone */}
          {currentView === 'upload' && (
            <div className="glass widget-card stack" style={{ gap: '24px' }}>
              <div className="widget-title">Upload Photos and Videos</div>
              <div
                className="dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  handleFileUpload(e)
                }}
                onClick={() => document.getElementById('file-upload-input').click()}
              >
                <span style={{ fontSize: '48px' }}>📁</span>
                <h3>Drag & Drop files here or click to browse</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  Supports JPEG, PNG, HEIC images & MP4, MOV videos. Max 5MB per file.
                </p>
                <input
                  id="file-upload-input"
                  type="file"
                  multiple
                  accept="image/*,video/mp4,video/quicktime"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </div>

              {/* Upload queue list */}
              {uploadQueue.length > 0 && (
                <div>
                  <div className="widget-title">Upload Queue Status</div>
                  <div className="stack" style={{ gap: '10px' }}>
                    {uploadQueue.map((item) => (
                      <div key={item.id} className="upload-queue-item">
                        <span style={{ width: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.name}
                        </span>

                        <div className="progress-bar-container">
                          <div
                            className="progress-bar-fill"
                            style={{
                              width: `${item.progress}%`,
                              background: item.status === 'failed' ? 'var(--danger)' : 'linear-gradient(90deg, var(--accent), #a78bfa)',
                            }}
                          ></div>
                        </div>

                        <span style={{ width: '80px', textAlign: 'right' }}>
                          {item.status === 'pending' && 'Queued'}
                          {item.status === 'uploading' && `${item.progress}%`}
                          {item.status === 'success' && 'Ready ✓'}
                          {item.status === 'failed' && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '2px 8px', fontSize: '11px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}
                              onClick={() => retryUpload(item.id)}
                            >
                              Retry
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* View: Public Share links configuration */}
          {currentView === 'share' && (
            <div className="glass widget-card stack" style={{ gap: '24px' }}>
              <div className="widget-title">Share Album Options</div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                Generate read-only, secure random share links to this album. You can optionally protect with a password and set links to expire automatically.
              </p>

              <form onSubmit={generateShareLink} className="stack" style={{ background: 'rgba(0,0,0,0.1)', padding: '16px', borderRadius: '16px' }}>
                <div className="share-setup-row">
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Optional Password Protection</label>
                    <input name="password" type="password" className="input-field" placeholder="Enter password (leave empty if public)" />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Expiry Duration (Hours)</label>
                    <input name="expiry" type="number" className="input-field" placeholder="e.g. 24 (leave empty for permanent)" min="1" />
                  </div>
                </div>
                <button className="btn-primary" style={{ marginTop: '12px' }}>Generate Public Share Link</button>
              </form>

              {/* List generated links */}
              {shareLinks.length > 0 && (
                <div>
                  <div className="widget-title">Active Share Links</div>
                  <div className="stack" style={{ gap: '10px' }}>
                    {shareLinks.map((link, idx) => (
                      <div key={idx} className="upload-queue-item" style={{ flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontSize: '12px', wordBreak: 'break-all', flex: 1 }}>{link.url}</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn-secondary" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => {
                            navigator.clipboard.writeText(link.url)
                            setMessage('Share link copied to clipboard!')
                          }}>Copy URL</button>
                          {link.password && <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '6px' }}>🔑 Protected</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* View: Admin Controls */}
          {currentView === 'admin' && isGroupAdmin && (
            <div className="glass widget-card stack" style={{ gap: '24px' }}>
              <div className="widget-title">Group Administration Panel</div>

              {/* Invite member by friend code */}
              <div style={{ background: 'rgba(0,0,0,0.1)', padding: '16px', borderRadius: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Invite New Member by Friend Code</div>
                <form onSubmit={inviteMemberByCode} style={{ display: 'flex', gap: '8px' }}>
                  <input name="friend_code" className="input-field" placeholder="Enter friend's 6-digit code" required pattern="\d{6}" maxLength={6} />
                  <button className="btn-primary" style={{ padding: '10px 16px' }}>Invite</button>
                </form>
              </div>

              {/* Members listing and controls */}
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Manage Members</div>
                <div className="stack" style={{ gap: '10px' }}>
                  {groupDetails?.members?.map((m) => (
                    <div key={m.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border-card)' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '500' }}>User ID: {m.user_id.substring(0, 8)}...</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Role: <strong>{m.role}</strong></div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {m.role !== 'admin' && (
                          <button className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={() => handleTransferAdmin(m.user_id)}>
                            Make Admin
                          </button>
                        )}
                        {m.user_id !== me?.id && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button
                              className="btn-secondary"
                              style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', fontSize: '12px', padding: '6px 12px' }}
                              onClick={() => {
                                const keep = confirm('Keep previously uploaded media by this member in the group?')
                                handleRemoveMember(m.user_id, keep)
                              }}
                            >
                              Remove Member
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delete Group section */}
              <div style={{ border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.03)', padding: '20px', borderRadius: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--danger)', marginBottom: '8px' }}>Danger Zone: Delete Group</div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  This will permanently delete this group album and soft delete all files from the storage service. This action cannot be undone.
                </p>
                <form onSubmit={handleDeleteGroup} className="stack">
                  <input name="group_name" className="input-field" placeholder={`Type "${groupDetails?.name}" to confirm`} required />
                  <button className="btn-primary" style={{ background: 'var(--danger)', boxShadow: 'none' }}>Delete Group Compeletely</button>
                </form>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Lightbox detailed viewer overlay */}
      {activeMediaItem && (
        <div className="modal-overlay" onClick={() => setActiveMediaItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-media-container">
              {activeMediaItem.media_type === 'video' ? (
                <video
                  className="modal-media-el"
                  controls
                  src={activeMediaItem.download_url}
                />
              ) : (
                <img
                  className="modal-media-el"
                  src={activeMediaItem.download_url}
                  alt={activeMediaItem.original_filename}
                />
              )}
            </div>

            <div className="modal-sidebar">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeMediaItem.original_filename}
                </h3>
                <button style={{ fontSize: '20px', cursor: 'pointer' }} onClick={() => setActiveMediaItem(null)}>✕</button>
              </div>

              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px', margin: '12px 0' }}>
                <div>Uploaded by: {activeMediaItem.uploader_id === me?.id ? 'You' : `User ${activeMediaItem.uploader_id.substring(0, 8)}`}</div>
                <div>Upload date: {new Date(activeMediaItem.uploaded_at).toLocaleString()}</div>
                <div>Size: {Math.round(activeMediaItem.size_bytes / (1024 * 1024) * 100) / 100} MB</div>
                <div>Type: {activeMediaItem.media_type}</div>
              </div>

              {/* Action buttons */}
              <div className="stack" style={{ gap: '10px', marginTop: 'auto' }}>
                <button className="btn-primary" onClick={() => handleSingleDownload(activeMediaItem)}>
                  Download Original File
                </button>

                <button className="btn-secondary" onClick={(e) => toggleFavorite(activeMediaItem.id, e)}>
                  {activeMediaItem.favorited ? '❤️ Remove from Favorites' : '🤍 Add to Favorites'}
                </button>

                <button
                  className="btn-secondary"
                  style={{ color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.08)' }}
                  onClick={() => deleteMediaItem(activeMediaItem.id)}
                >
                  🗑️ Delete Media
                </button>
              </div>

              {/* Duplicate resolution widget */}
              {activeMediaItem.duplicate_of_id && (
                <div style={{ border: '1px solid var(--warning)', background: 'rgba(245,158,11,0.05)', padding: '16px', borderRadius: '12px', marginTop: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--warning)', marginBottom: '8px' }}>⚠️ Duplicate Flagged</div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                    This item has identical hashes with another image in the album.
                  </p>
                  <div className="stack" style={{ gap: '6px' }}>
                    <button className="btn-secondary" style={{ fontSize: '11px', padding: '6px' }} onClick={() => handleResolveDuplicate(activeMediaItem.id, 'keep_both')}>
                      Keep Both Files
                    </button>
                    <button className="btn-secondary" style={{ fontSize: '11px', padding: '6px' }} onClick={() => handleResolveDuplicate(activeMediaItem.id, 'merge', activeMediaItem.duplicate_of_id)}>
                      Merge with Existing
                    </button>
                    <button className="btn-secondary" style={{ fontSize: '11px', padding: '6px', color: 'var(--danger)' }} onClick={() => handleResolveDuplicate(activeMediaItem.id, 'delete')}>
                      Delete Duplicate
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Public Gallery component for Shared links
function PublicGallery({ shareToken, onClose }) {
  const [password, setPassword] = useState('')
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [group, setGroup] = useState(null)
  const [media, setMedia] = useState([])
  const [error, setError] = useState('')
  const [activeMediaItem, setActiveMediaItem] = useState(null)

  const fetchSharedAlbum = async (pwd = '') => {
    setError('')
    try {
      const url = `/groups/share-links/${shareToken}${pwd ? `?password=${encodeURIComponent(pwd)}` : ''}`
      const res = await fetch(`${import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'}${url}`)
      const data = await res.json()

      if (res.status === 401) {
        setPasswordRequired(true)
        return
      }
      if (!res.ok) {
        setError(data.detail || 'Failed to load album')
        return
      }

      setGroup(data.group)
      setMedia(data.media)
      setPasswordRequired(false)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    fetchSharedAlbum()
  }, [shareToken])

  const handlePasswordSubmit = (e) => {
    e.preventDefault()
    fetchSharedAlbum(password)
  }

  if (passwordRequired) {
    return (
      <div className="auth" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handlePasswordSubmit} className="glass stack widget-card" style={{ width: '400px' }}>
          <h2 style={{ textAlign: 'center' }}>TripShare Secure Album</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center' }}>
            This share link is password-protected. Enter credentials below.
          </p>
          {error && <div className="alert">{error}</div>}
          <input
            type="password"
            className="input-field"
            placeholder="Album Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="btn-primary">Unlock Album</button>
          <button type="button" className="btn-secondary" onClick={onClose}>Back to Login</button>
        </form>
      </div>
    )
  }

  return (
    <div className="app-container" style={{ padding: '24px' }}>
      <header className="navbar glass" style={{ margin: '0 0 24px 0' }}>
        <div className="brand-logo">TripShare Public Shared Album</div>
        <button className="btn-secondary" onClick={onClose}>Login / Dashboard</button>
      </header>

      {error && <div className="alert" style={{ marginBottom: '24px' }}>{error}</div>}

      {group && (
        <div className="glass widget-card" style={{ marginBottom: '24px' }}>
          <h2>{group.name}</h2>
          <p style={{ color: 'var(--text-secondary)', margin: '6px 0 12px 0' }}>{group.description}</p>
          <div style={{ fontSize: '13px' }}>Trip date: {group.trip_date}</div>
        </div>
      )}

      {/* Grid of Shared Media */}
      <div className="media-grid">
        {media.map((item) => {
          const fullThumbUrl = item.thumbnail_url || item.download_url
          return (
            <div key={item.id} className="media-tile" onClick={() => setActiveMediaItem(item)}>
              <img className="media-thumbnail" src={fullThumbUrl} alt={item.original_filename} />
              {item.media_type === 'video' && <div className="video-badge">📹 video</div>}
              <div className="media-overlay">
                <div className="media-title">{item.original_filename}</div>
              </div>
            </div>
          )
        })}
      </div>

      {activeMediaItem && (
        <div className="modal-overlay" onClick={() => setActiveMediaItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-media-container">
              {activeMediaItem.media_type === 'video' ? (
                <video className="modal-media-el" controls src={activeMediaItem.download_url} />
              ) : (
                <img className="modal-media-el" src={activeMediaItem.download_url} alt={activeMediaItem.original_filename} />
              )}
            </div>
            <div className="modal-sidebar">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>{activeMediaItem.original_filename}</h3>
                <button onClick={() => setActiveMediaItem(null)}>✕</button>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '16px 0' }}>
                Size: {Math.round(activeMediaItem.size_bytes / (1024 * 1024) * 100) / 100} MB
              </p>
              <a href={activeMediaItem.download_url} className="btn-primary" style={{ textDecoration: 'none', textAlign: 'center' }} download>
                Download Original File
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Auth({ onAuth, error }) {
  const [mode, setMode] = useState('login')
  const submit = (event) => {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    onAuth(data, mode === 'login' ? '/auth/login' : '/auth/register')
  }

  return (
    <div className="auth" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass widget-card" style={{ width: '420px', padding: '32px' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '24px', letterSpacing: '-0.5px' }}>TripShare</h1>
        <div className="tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border-card)', paddingBottom: '12px', marginBottom: '24px' }}>
          <button className={`btn-secondary ${mode === 'login' ? 'active' : ''}`} style={{ flex: 1, fontWeight: mode === 'login' ? '700' : '400' }} onClick={() => setMode('login')}>Login</button>
          <button className={`btn-secondary ${mode === 'register' ? 'active' : ''}`} style={{ flex: 1, fontWeight: mode === 'register' ? '700' : '400' }} onClick={() => setMode('register')}>Register</button>
        </div>
        <form onSubmit={submit} className="stack">
          {mode === 'register' && (
            <input name="name" className="input-field" placeholder="Full Name" required />
          )}
          <input name="email" type="email" className="input-field" placeholder="Email Address" required />
          <input name="password" type="password" className="input-field" placeholder="Password (min. 8 chars)" required minLength={8} />
          <button className="btn-primary" style={{ marginTop: '12px' }}>
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
          {error && (
            <div className="alert" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid var(--danger)', marginTop: '16px', fontSize: '13px' }}>
              ⚠️ {error}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
