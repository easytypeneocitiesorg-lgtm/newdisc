import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getDatabase, ref, set, get, push, update, remove, onValue, onChildAdded, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";

// ==========================================
// 1. FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBrFFktufCayJJyiW7owlPQbIWKM1zBbOk",
    authDomain: "learnalgebramaximus.firebaseapp.com",
    databaseURL: "https://learnalgebramaximus-default-rtdb.firebaseio.com",
    projectId: "learnalgebramaximus",
    storageBucket: "learnalgebramaximus.firebasestorage.app",
    messagingSenderId: "581042253297",
    appId: "1:581042253297:web:a1ac31330f78b8e4c76850",
    measurementId: "G-D7D4G9VE8R"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================
// 2. STATE & DOM ELEMENTS
// ==========================================
let currentUser = null;
let currentChannel = localStorage.getItem('lastChannel') || 'general';
let replyingToId = null;
let editingMsgId = null;
let loadedMessagesCache = {};

const defaultAvatar = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2NjYyI+PHBhdGggZD0iTTEyIDJDMi40OCAyIC0uogniID48L3N2Zz4=";

const el = (id) => document.getElementById(id);
const screens = { auth: el('auth-screen'), app: el('app-screen'), blocked: el('blocked-screen') };

// ==========================================
// 3. UTILITIES & SECURITY (Web Crypto)
// ==========================================
async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    el('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function sanitize(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ==========================================
// 4. AUTHENTICATION & SESSION
// ==========================================
let isLoginMode = true;

el('auth-toggle-link').onclick = (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    el('auth-header').innerText = isLoginMode ? "Log In" : "Create Account";
    el('auth-action-btn').innerText = isLoginMode ? "Log In" : "Sign Up";
    el('auth-toggle-text').innerText = isLoginMode ? "Need an account?" : "Already have an account?";
    el('auth-error').innerText = "";
};

el('auth-action-btn').onclick = async () => {
    const userRaw = el('auth-username').value.trim();
    const passRaw = el('auth-password').value;
    const errorEl = el('auth-error');
    
    if(!/^[A-Za-z0-9_]{3,16}$/.test(userRaw)) return errorEl.innerText = "Username must be 3-16 chars (letters, numbers, _).";
    if(passRaw.length < 6) return errorEl.innerText = "Password too short.";

    const userNorm = userRaw.toLowerCase();
    const pHash = await hashPassword(passRaw);
    
    el('auth-action-btn').disabled = true;
    errorEl.innerText = "Processing...";

    try {
        const unRef = ref(db, `usernames/${userNorm}`);
        const unSnap = await get(unRef);

        if (isLoginMode) {
            if (!unSnap.exists()) throw new Error("Account not found.");
            const uid = unSnap.val();
            const uSnap = await get(ref(db, `users/${uid}`));
            if (uSnap.val().passwordHash !== pHash) throw new Error("Incorrect password.");
            await startSession(uid, uSnap.val());
        } else {
            if (unSnap.exists()) throw new Error("Username taken.");
            const uid = push(ref(db, 'users')).key;
            const isOwner = userNorm === 'owner';
            const newUser = {
                username: userRaw,
                normalizedUsername: userNorm,
                passwordHash: pHash,
                displayName: userRaw,
                bio: "",
                profilePicture: defaultAvatar,
                role: isOwner ? "owner" : "user",
                blocked: false,
                mutedUntil: 0,
                createdAt: Date.now()
            };
            
            await update(ref(db), { [`usernames/${userNorm}`]: uid, [`users/${uid}`]: newUser });
            await startSession(uid, newUser);
        }
    } catch (err) {
        errorEl.innerText = err.message;
    }
    el('auth-action-btn').disabled = false;
};

async function startSession(uid, userData) {
    if (userData.blocked) return showScreen('blocked');
    localStorage.setItem('tnd_uid', uid);
    currentUser = { uid, ...userData };
    initApp();
}

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');
}

window.onload = async () => {
    const uid = localStorage.getItem('tnd_uid');
    if (!uid) return showScreen('auth');
    
    const uSnap = await get(ref(db, `users/${uid}`));
    if (uSnap.exists()) {
        const uData = uSnap.val();
        if(uData.blocked) return showScreen('blocked');
        currentUser = { uid, ...uData };
        initApp();
    } else {
        localStorage.removeItem('tnd_uid');
        showScreen('auth');
    }
};

el('btn-logout').onclick = () => {
    localStorage.removeItem('tnd_uid');
    window.location.reload();
};

// ==========================================
// 5. MAIN APP INITIALIZATION & LISTENERS
// ==========================================
function initApp() {
    showScreen('app');
    updateUserInterfaceIdentity();

    if (['owner', 'admin', 'helper'].includes(currentUser.role)) {
        el('chan-staff').classList.remove('hidden');
        el('staff-controls').classList.remove('hidden');
        if(['owner', 'admin'].includes(currentUser.role)) el('btn-mod-broadcast').classList.remove('hidden');
    }

    onValue(ref(db, `users/${currentUser.uid}`), (snap) => {
        if(!snap.exists()) return el('btn-logout').click();
        const data = snap.val();
        if(data.blocked) return window.location.reload(); 
        currentUser = { uid: currentUser.uid, ...data };
        updateUserInterfaceIdentity();
    });

    onValue(ref(db, 'broadcast/current'), (snap) => {
        const b = snap.val();
        const banner = el('broadcast-banner');
        if(b && b.expiresAt > Date.now()) {
            banner.innerText = b.message;
            banner.classList.remove('hidden');
            setTimeout(() => banner.classList.add('hidden'), b.expiresAt - Date.now());
        } else { banner.classList.add('hidden'); }
    });

    if(['owner', 'admin'].includes(currentUser.role)) {
        onValue(ref(db, 'blockRequests'), (snap) => {
            el('req-dot').classList.toggle('hidden', !snap.exists());
        });
    }

    switchChannel(currentChannel);
}

function updateUserInterfaceIdentity() {
    el('my-avatar').src = currentUser.profilePicture;
    el('my-name').innerText = currentUser.displayName;
    
    const roleBadge = el('my-role');
    if(currentUser.role !== 'user') {
        const roleEmojis = { owner: '👑', admin: '🛡️', helper: '⭐' };
        roleBadge.innerText = roleEmojis[currentUser.role] || currentUser.role;
        roleBadge.className = `role-badge role-${currentUser.role}`;
    } else { roleBadge.innerText = ""; roleBadge.className="role-badge"; }
}

// ==========================================
// 6. CHANNEL & MESSAGING
// ==========================================
document.querySelectorAll('.channel-item').forEach(item => {
    item.onclick = () => switchChannel(item.dataset.channel);
});

function switchChannel(channelId) {
    if(channelId === 'staff' && !['owner', 'admin', 'helper'].includes(currentUser.role)) channelId = 'general';
    
    currentChannel = channelId;
    localStorage.setItem('lastChannel', channelId);
    
    document.querySelectorAll('.channel-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`[data-channel="${channelId}"]`).classList.add('active');
    el('current-channel-name').innerText = `# ${channelId}`;
    
    el('chat-messages').innerHTML = "";
    loadedMessagesCache = {};
    
    const cRef = ref(db, `messages/${channelId}`);
    
    onValue(cRef, (snapshot) => {
        const container = el('chat-messages');
        const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
        
        container.innerHTML = "";
        loadedMessagesCache = {};
        
        if(snapshot.exists()) {
            const msgs = snapshot.val();
            Object.entries(msgs).forEach(([id, data]) => {
                loadedMessagesCache[id] = data;
                renderMessage(id, data, false);
            });
        }
        if(wasAtBottom) {
            container.scrollTop = container.scrollHeight;
        }
    }, { onlyOnce: true });

    onChildAdded(cRef, (data) => {
        loadedMessagesCache[data.key] = data.val();
        if(!el(`msg-${data.key}`)) {
            renderMessage(data.key, data.val(), true);
        }
    });
}

el('btn-send').onclick = () => sendMessage();
el('msg-input').onkeydown = (e) => {
    if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
};

async function sendMessage(fileData = null) {
    if(currentUser.mutedUntil > Date.now()) return showToast(`Muted. Expires in ${Math.ceil((currentUser.mutedUntil - Date.now())/60000)} min.`);
    
    const input = el('msg-input');
    const text = input.value.trim();
    if(!text && !fileData) return;

    input.value = "";
    const msgObj = {
        senderId: currentUser.uid,
        senderUsername: currentUser.username,
        senderDisplay: currentUser.displayName,
        senderAvatar: currentUser.profilePicture,
        senderRole: currentUser.role || 'user',
        text: text,
        timestamp: serverTimestamp(),
        replyTo: replyingToId,
        file: fileData
    };

    if(editingMsgId) {
        await update(ref(db, `messages/${currentChannel}/${editingMsgId}`), { text: text, edited: true });
        editingMsgId = null;
    } else {
        await push(ref(db, `messages/${currentChannel}`), msgObj);
    }
    
    cancelReply();
}

// ==========================================
// 7. FILE HANDLING (Base64)
// ==========================================
el('btn-upload').onclick = () => el('file-upload').click();

el('file-upload').onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    
    if(file.size > 2 * 1024 * 1024) return showToast("File too large. Max 2MB."); 
    
    const reader = new FileReader();
    reader.onload = (ev) => {
        const base64Str = ev.target.result;
        if(base64Str.length > 3000000) return showToast("File encoding too large.");
        sendMessage({ name: file.name, type: file.type, data: base64Str, size: file.size });
    };
    reader.readAsDataURL(file);
    el('file-upload').value = ""; 
};

// ==========================================
// 8. MESSAGE RENDERING
// ==========================================
function renderMessage(id, data, shouldScroll = true) {
    if(el(`msg-${id}`)) return;

    const div = document.createElement('div');
    div.className = 'message';
    div.id = `msg-${id}`;
    
    const time = new Date(data.timestamp || Date.now());
    const isToday = time.toDateString() === new Date().toDateString();
    const timeStr = isToday ? `Today at ${time.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}` : time.toLocaleString();

    let fileHtml = "";
    if(data.file) {
        if(data.file.type.startsWith('image/')) fileHtml = `<img src="${data.file.data}" class="media-embed">`;
        else if(data.file.type.startsWith('video/')) fileHtml = `<video src="${data.file.data}" controls class="media-embed"></video>`;
        else if(data.file.type.startsWith('audio/')) fileHtml = `<audio src="${data.file.data}" controls class="media-embed"></audio>`;
        else fileHtml = `<div class="file-card"><span>📄 ${sanitize(data.file.name)}</span> <a href="${data.file.data}" download="${sanitize(data.file.name)}"><button>Download</button></a></div>`;
    }

    let replyHtml = "";
    if(data.replyTo) {
        const parentMsg = loadedMessagesCache[data.replyTo];
        const previewSnippet = parentMsg ? (parentMsg.text || (parentMsg.file ? `[File: ${parentMsg.file.name}]` : "Original message")) : "Original message";
        replyHtml = `<div class="reply-ref" onclick="document.getElementById('msg-${data.replyTo}')?.scrollIntoView()">Replying to: "${sanitize(previewSnippet)}"</div>`;
    }

    let roleBadgeHtml = "";
    const role = data.senderRole || 'user';
    if(role === 'owner') {
        roleBadgeHtml = `<span title="owner" class="role-badge role-owner" style="font-size:0.7rem; padding:1px 4px;">👑</span>`;
    } else if(role === 'admin') {
        roleBadgeHtml = `<span title="admin" class="role-badge role-admin" style="font-size:0.7rem; padding:1px 4px;">🛡️</span>`;
    } else if(role === 'helper') {
        roleBadgeHtml = `<span title="helper" class="role-badge role-helper" style="font-size:0.7rem; padding:1px 4px;">⭐</span>`;
    }

    const canEdit = data.senderId === currentUser.uid;
    const canDel = canEdit || ['owner', 'admin', 'helper'].includes(currentUser.role);

    div.innerHTML = `
        <img src="${data.senderAvatar}" class="avatar clickable" onclick="viewUser('${data.senderId}')">
        <div class="msg-content">
            ${replyHtml}
            <div class="msg-header">
                <span class="msg-name" onclick="viewUser('${data.senderId}')">${sanitize(data.senderDisplay)}</span>
                ${roleBadgeHtml}
                <span class="msg-time">${timeStr}</span>
                ${data.edited ? '<span class="msg-edited">(edited)</span>' : ''}
            </div>
            <div class="msg-text">${sanitize(data.text)}</div>
            ${fileHtml}
        </div>
        <div class="msg-actions">
            <button class="text-action-btn" onclick="replyTo('${id}', '${sanitize(data.senderDisplay)}', \`${sanitize(data.text || (data.file ? data.file.name : 'attachment'))}\`)">reply</button>
            ${canEdit ? `<button class="text-action-btn" onclick="editMsg('${id}', \`${sanitize(data.text)}\`)">edit</button>` : ''}
            ${canDel ? `<button class="text-action-btn" style="color:var(--danger);" onclick="delMsg('${id}')">delete</button>` : ''}
        </div>
    `;

    const container = el('chat-messages');
    container.appendChild(div);
    
    if(shouldScroll) {
        if(container.scrollHeight - container.scrollTop < container.clientHeight + 150) {
            container.scrollTop = container.scrollHeight;
        }
    }
}

window.replyTo = (id, name, text) => {
    replyingToId = id;
    el('reply-preview').classList.remove('hidden');
    el('reply-to-name').innerText = name;
    el('reply-to-text').innerText = text.length > 40 ? text.substring(0, 40) + '...' : text;
    el('msg-input').focus();
};

window.editMsg = (id, text) => {
    editingMsgId = id;
    el('msg-input').value = text;
    el('msg-input').focus();
};

window.delMsg = async (id) => {
    if(confirm("Delete message?")) await remove(ref(db, `messages/${currentChannel}/${id}`));
};

el('btn-cancel-reply').onclick = cancelReply;
function cancelReply() {
    replyingToId = null;
    editingMsgId = null;
    el('reply-preview').classList.add('hidden');
}

// ==========================================
// 9. PROFILES & MODALS
// ==========================================
function openModal(id) { el('modal-overlay').classList.remove('hidden'); el(id).classList.remove('hidden'); }
function closeModals() {
    el('modal-overlay').classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}
document.querySelectorAll('.close-modal').forEach(b => b.onclick = closeModals);
el('modal-overlay').onclick = closeModals;
document.onkeydown = (e) => { if(e.key === 'Escape') closeModals(); };

el('btn-profile').onclick = () => {
    el('edit-display-name').value = currentUser.displayName;
    el('edit-bio').value = currentUser.bio;
    openModal('modal-profile');
};

el('my-avatar').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = (e) => {
        const f = e.target.files[0];
        if(!f) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const b64 = ev.target.result;
            await update(ref(db, `users/${currentUser.uid}`), { profilePicture: b64 });
            currentUser.profilePicture = b64;
            updateUserInterfaceIdentity();
            showToast("Avatar updated successfully!");
        };
        reader.readAsDataURL(f);
    };
    inp.click();
};

el('btn-save-profile').onclick = async () => {
    const name = el('edit-display-name').value.trim();
    const bio = el('edit-bio').value.trim();
    if(name.length > 16) return showToast("Name max 16 chars.");
    await update(ref(db, `users/${currentUser.uid}`), { displayName: name || currentUser.username, bio: bio });
    currentUser.displayName = name || currentUser.username;
    currentUser.bio = bio;
    updateUserInterfaceIdentity();
    closeModals();
    showToast("Profile updated!");
};

window.viewUser = async (uid) => {
    const snap = await get(ref(db, `users/${uid}`));
    if(!snap.exists()) return;
    const u = snap.val();
    
    el('view-user-avatar').src = u.profilePicture;
    el('view-user-display').innerText = u.displayName;
    el('view-user-username').innerText = `@${u.username}`;
    el('view-user-bio').innerText = u.bio;
    
    const roleEmojis = { owner: '👑', admin: '🛡️', helper: '⭐' };
    el('view-user-role').innerText = u.role !== 'user' ? (roleEmojis[u.role] || u.role) : '';
    el('view-user-role').className = `role-badge role-${u.role}`;
    
    const actions = el('view-user-mod-actions');
    actions.innerHTML = "";
    actions.classList.add('hidden');

    if(uid !== currentUser.uid && u.role !== 'owner') {
        const isStaff = ['owner', 'admin', 'helper'].includes(currentUser.role);
        if(isStaff) {
            actions.classList.remove('hidden');
            
            if(['owner', 'admin'].includes(currentUser.role)) {
                actions.innerHTML += `<button class="danger-btn" onclick="modAction('${uid}', 'block', ${!u.blocked})">${u.blocked ? 'Unblock' : 'Block'}</button>`;
                actions.innerHTML += `<button class="danger-btn" onclick="modAction('${uid}', 'mute')">Mute 10m</button>`;
            } else if(currentUser.role === 'helper') {
                actions.innerHTML += `<button class="danger-btn" onclick="openBlockReq('${uid}')">Req Block</button>`;
            }

            if(currentUser.role === 'owner') {
                if(u.role === 'user') {
                    actions.innerHTML += `<button class="primary-btn" onclick="modAction('${uid}', 'role', 'helper')">Make Helper</button>`;
                    actions.innerHTML += `<button class="primary-btn" onclick="modAction('${uid}', 'role', 'admin')">Make Admin</button>`;
                } else {
                    actions.innerHTML += `<button class="danger-btn" onclick="modAction('${uid}', 'role', 'user')">Revoke Role</button>`;
                }
                actions.innerHTML += `<button class="danger-btn" onclick="modAction('${uid}', 'wipe')">Wipe Acc</button>`;
            }
        }
    }
    openModal('modal-view-user');
};

// ==========================================
// 10. MODERATION ACTIONS
// ==========================================
window.modAction = async (uid, action, val = null) => {
    const uRef = ref(db, `users/${uid}`);
    if(action === 'block') await update(uRef, { blocked: val });
    if(action === 'mute') await update(uRef, { mutedUntil: Date.now() + 10 * 60000 });
    if(action === 'role') await update(uRef, { role: val });
    if(action === 'wipe') {
        const snap = await get(uRef);
        const oldUser = snap.val();
        const newUn = `user_${Math.random().toString(36).substr(2,6)}`;
        await remove(ref(db, `usernames/${oldUser.normalizedUsername}`));
        await update(ref(db), {
            [`usernames/${newUn}`]: uid,
            [`users/${uid}/username`]: newUn,
            [`users/${uid}/normalizedUsername`]: newUn,
            [`users/${uid}/displayName`]: newUn,
            [`users/${uid}/bio`]: "",
            [`users/${uid}/profilePicture`]: defaultAvatar
        });
    }
    closeModals();
    showToast(`Action ${action} completed.`);
};

el('btn-mod-users').onclick = () => { openModal('modal-user-manager'); searchUsers(""); };
el('search-users').oninput = (e) => searchUsers(e.target.value.toLowerCase());

async function searchUsers(q) {
    const container = el('user-search-results');
    container.innerHTML = "Loading...";
    const snap = await get(ref(db, 'users'));
    container.innerHTML = "";
    if(!snap.exists()) return;
    
    Object.entries(snap.val()).forEach(([uid, u]) => {
        if(u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q)) {
            const roleEmojis = { owner: '👑', admin: '🛡️', helper: '⭐' };
            const roleDisplay = u.role !== 'user' ? (roleEmojis[u.role] || u.role) : '';
            const div = document.createElement('div');
            div.className = 'user-row';
            div.innerHTML = `<div style="display:flex;gap:10px;align-items:center;">
                <img src="${u.profilePicture}" class="avatar" style="width:24px;height:24px;min-width:24px;min-height:24px;">
                <span>${sanitize(u.username)}</span>
            </div> <span>${roleDisplay}</span>`;
            div.onclick = () => viewUser(uid);
            container.appendChild(div);
        }
    });
}

if(el('btn-mod-broadcast')) {
    el('btn-mod-broadcast').onclick = () => openModal('modal-broadcast');
    el('btn-send-broadcast').onclick = async () => {
        const msg = el('broadcast-msg').value.trim();
        const dur = parseInt(el('broadcast-duration').value) || 10;
        if(!msg || dur < 3 || dur > 20) return;
        
        await set(ref(db, 'broadcast/current'), {
            message: msg,
            createdBy: currentUser.uid,
            startedAt: Date.now(),
            expiresAt: Date.now() + (dur * 1000)
        });
        closeModals();
        el('broadcast-msg').value = "";
    };
}

let tempReqUid = null;
window.openBlockReq = (uid) => { tempReqUid = uid; closeModals(); openModal('modal-block-req'); };

el('btn-submit-block-req').onclick = async () => {
    const reason = el('block-req-reason').value.trim();
    if(!reason) return;
    const reqId = push(ref(db, 'blockRequests')).key;
    await set(ref(db, `blockRequests/${reqId}`), {
        targetUserId: tempReqUid,
        requestedBy: currentUser.username,
        reason: reason,
        createdAt: Date.now()
    });
    closeModals();
    showToast("Request sent.");
};

el('btn-mod-requests').onclick = async () => {
    openModal('modal-req-list');
    const container = el('req-list-container');
    container.innerHTML = "Loading...";
    const snap = await get(ref(db, 'blockRequests'));
    container.innerHTML = "";
    
    if(!snap.exists()) return container.innerHTML = "No pending requests.";
    
    Object.entries(snap.val()).forEach(([reqId, req]) => {
        const div = document.createElement('div');
        div.className = 'req-row';
        div.innerHTML = `
            <div>
                <strong>Target:</strong> ${req.targetUserId.substring(0,6)}...<br>
                <small>By: ${req.requestedBy}</small><br>
                <small>Reason: ${sanitize(req.reason)}</small>
            </div>
            <div style="display:flex;gap:5px;">
                <button class="primary-btn" onclick="resolveReq('${reqId}', '${req.targetUserId}', true)">Accept</button>
                <button class="danger-btn" onclick="resolveReq('${reqId}', null, false)">Deny</button>
            </div>
        `;
        container.appendChild(div);
    });
};

window.resolveReq = async (reqId, targetUid, accept) => {
    if(accept) await update(ref(db, `users/${targetUid}`), { blocked: true });
    await remove(ref(db, `blockRequests/${reqId}`));
    el('btn-mod-requests').click(); 
};
