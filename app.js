import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, set, get, update, remove, push,
  onValue, off, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

const CHANNELS = ["rules", "general", "off-topic", "staff"];
const STAFF_ROLES = ["owner", "admin", "helper"];
const USERNAME_REGEX = /^[A-Za-z0-9_]{3,16}$/;
const MAX_MSG_LEN = 2000;
const MAX_DISPLAY_NAME_LEN = 16;
const MAX_BIO_LEN = 750;
const MAX_BROADCAST_LEN = 300;
const MAX_REASON_LEN = 300;
const MIN_BROADCAST_SEC = 3;
const MAX_BROADCAST_SEC = 20;
const MIN_MUTE_SEC = 30;
const MAX_MUTE_SEC = 600;
const MAX_FILE_BYTES = 4.5 * 1024 * 1024; 
const MAX_AVATAR_DIMENSION = 256;
const SESSION_KEY = "tnd_session_v1";
const LAST_CHANNEL_KEY = "tnd_last_channel_v1";
const DEFAULT_AVATAR_SVG = buildDefaultAvatarSvg();

const state = {
  currentUser: null,
  currentUid: null,
  currentChannel: "general",
  messageListeners: {},
  userListeners: [],
  usersCache: {},
  allUsersLoaded: false,
  replyTarget: null,
  pendingFile: null,
  muteTimer: null,
  broadcastTimer: null,
  isNearBottom: true,
  activeManagedUid: null,
  lastMessageTime: 0,
  typingTimer: null,
};

const $ = (id) => document.getElementById(id);

const el = {
  loadingScreen: $("loading-screen"), authScreen: $("auth-screen"), blockedScreen: $("blocked-screen"), mainApp: $("main-app"),
  tabLogin: $("tab-login"), tabSignup: $("tab-signup"), authForm: $("auth-form"), authUsername: $("auth-username"), authPassword: $("auth-password"), authError: $("auth-error"), authSubmit: $("auth-submit"), authSubmitLabel: $("auth-submit-label"), authSubmitSpinner: $("auth-submit-spinner"),
  blockedLogoutBtn: $("blocked-logout-btn"), broadcastBanner: $("broadcast-banner"), broadcastText: $("broadcast-text"),
  sidebar: $("sidebar"), sidebarToggle: $("sidebar-toggle"), mobileSidebarBtn: $("mobile-sidebar-btn"), connectionStatus: $("connection-status"), statusDot: $("status-dot"), statusLabel: $("status-label"), channelList: $("channel-list"), dmsList: $("dms-list"), dmsSidebarTitle: $("dms-sidebar-title"),
  userPanelAvatarBtn: $("user-panel-avatar-btn"), userPanelAvatar: $("user-panel-avatar"), userPanelName: $("user-panel-name"), userPanelRole: $("user-panel-role"), profileBtn: $("profile-btn"), logoutBtn: $("logout-btn"),
  channelNameDisplay: $("channel-name-display"), staffControls: $("staff-controls"), messagesScroll: $("messages-scroll"), messagesList: $("messages-list"), emptyChannelState: $("empty-channel-state"), newMessagesBtn: $("new-messages-btn"),
  muteNotice: $("mute-notice"), muteRemaining: $("mute-remaining"), replyPreview: $("reply-preview"), replyPreviewName: $("reply-preview-name"), replyPreviewSnippet: $("reply-preview-snippet"), cancelReplyBtn: $("cancel-reply-btn"),
  fileUploadBtn: $("file-upload-btn"), fileInput: $("file-input"), messageInput: $("message-input"), sendBtn: $("send-btn"), filePreview: $("file-preview"), messageComposer: $("message-composer"),
  typingIndicator: $("typing-indicator"), dmHomeView: $("dm-home-view"), dmStartSearch: $("dm-start-search"), dmStartResults: $("dm-start-results"), dmHeaderActions: $("dm-header-actions"), dmBlockBtn: $("dm-block-btn"), dmLeaveBtn: $("dm-leave-btn"), dmAddUserBtn: $("dm-add-user-btn"), dmAddSearch: $("dm-add-search"), dmAddResults: $("dm-add-results"),
  modalOverlay: $("modal-overlay"), modalProfile: $("modal-profile"), profileDisplayName: $("profile-display-name"), profileBio: $("profile-bio"), dnCounter: $("dn-counter"), bioCounter: $("bio-counter"), profileError: $("profile-error"), profileSaveBtn: $("profile-save-btn"),
  modalViewProfile: $("modal-view-profile"), vpAvatar: $("vp-avatar"), vpDisplayName: $("vp-display-name"), vpUsername: $("vp-username"), vpRole: $("vp-role"), vpBio: $("vp-bio"),
  modalStaffMenu: $("modal-staff-menu"), staffBroadcastBtn: $("staff-broadcast-btn"), staffUsermanagerBtn: $("staff-usermanager-btn"), staffBlockrequestsBtn: $("staff-blockrequests-btn"), blockRequestsDot: $("block-requests-dot"),
  modalBroadcast: $("modal-broadcast"), broadcastMessage: $("broadcast-message"), broadcastCounter: $("broadcast-counter"), broadcastDuration: $("broadcast-duration"), broadcastError: $("broadcast-error"), broadcastSendBtn: $("broadcast-send-btn"),
  modalUsermanager: $("modal-usermanager"), userSearchInput: $("user-search-input"), userSearchResults: $("user-search-results"),
  modalManageUser: $("modal-manage-user"), muAvatar: $("mu-avatar"), muDisplayName: $("mu-display-name"), muUsername: $("mu-username"), muActions: $("mu-actions"),
  modalBlockReason: $("modal-block-reason"), blockReasonInput: $("block-reason-input"), reasonCounter: $("reason-counter"), blockReasonError: $("block-reason-error"), blockReasonSubmit: $("block-reason-submit"),
  modalBlockRequests: $("modal-block-requests"), blockRequestsList: $("block-requests-list"), blockRequestsEmpty: $("block-requests-empty"),
  modalConfirm: $("modal-confirm"), confirmTitle: $("confirm-title"), confirmMessage: $("confirm-message"), confirmActionBtn: $("confirm-action-btn"), modalAddToDm: $("modal-add-to-dm"),
  toastContainer: $("toast-container"),
  avatarInput: $("avatar-input"),
};

function textNode(str) { return document.createTextNode(str == null ? "" : String(str)); }
function makeEl(tag, opts = {}) {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.appendChild(textNode(opts.text));
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  if (opts.onClick) node.addEventListener("click", opts.onClick);
  return node;
}
function clearChildren(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function safeAvatarSrc(pic) { return (typeof pic === "string" && pic.startsWith("data:image")) ? pic : DEFAULT_AVATAR_SVG; }

function buildDefaultAvatarSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7c6cf6"/><stop offset="100%" stop-color="#a06cf6"/></linearGradient></defs>
    <rect width="100" height="100" rx="50" fill="url(#g)"/><circle cx="50" cy="40" r="18" fill="rgba(255,255,255,0.85)"/><path d="M20 88 Q50 58 80 88 Z" fill="rgba(255,255,255,0.85)"/>
  </svg>`;
  return "data:image/svg+xml;base64," + btoa(svg);
}

function showToast(message, type = "info") {
  const toast = makeEl("div", { className: `toast ${type}`, text: message });
  el.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.25s ease";
    setTimeout(() => toast.remove(), 260);
  }, 3400);
}

const ALL_MODALS = ["modalProfile", "modalViewProfile", "modalStaffMenu", "modalBroadcast", "modalUsermanager", "modalManageUser", "modalBlockReason", "modalBlockRequests", "modalConfirm", "modalAddToDm"];
function openModal(key) {
  el.modalOverlay.classList.remove("hidden");
  for (const k of ALL_MODALS) el[k].classList.toggle("hidden", k !== key);
}
function closeModals() {
  el.modalOverlay.classList.add("hidden");
  for (const k of ALL_MODALS) el[k].classList.add("hidden");
}
el.modalOverlay.addEventListener("click", (e) => { if (e.target === el.modalOverlay) closeModals(); });
document.querySelectorAll("[data-close-modal]").forEach((btn) => btn.addEventListener("click", closeModals));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.modalOverlay.classList.contains("hidden")) closeModals(); });

function askConfirm(title, message, onConfirm) {
  el.confirmTitle.textContent = title;
  el.confirmMessage.textContent = message;
  openModal("modalConfirm");
  const handler = () => { closeModals(); el.confirmActionBtn.removeEventListener("click", handler); onConfirm(); };
  const fresh = el.confirmActionBtn.cloneNode(true);
  el.confirmActionBtn.parentNode.replaceChild(fresh, el.confirmActionBtn);
  el.confirmActionBtn = fresh;
  el.confirmActionBtn.addEventListener("click", handler);
}

function bufToHex(buf) { return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""); }
function randomSaltHex(bytes = 16) { const arr = new Uint8Array(bytes); crypto.getRandomValues(arr); return bufToHex(arr.buffer); }
async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const data = enc.encode(saltHex + ":" + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufToHex(digest);
}

function normalizeUsername(username) { return (username || "").trim().toLowerCase(); }
function isValidUsernameFormat(username) { return USERNAME_REGEX.test(username || ""); }
async function isUsernameTaken(normalized) { const snap = await get(ref(db, `usernames/${normalized}`)); return snap.exists(); }

function randomSixChars() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = ""; const arr = new Uint8Array(6); crypto.getRandomValues(arr);
  for (let i = 0; i < 6; i++) out += chars[arr[i] % chars.length];
  return out;
}
async function generateUniqueWipedUsername() {
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = `user_${randomSixChars()}`;
    if (!(await isUsernameTaken(normalizeUsername(candidate)))) return candidate;
  }
  throw new Error("Failed to generate wiped username.");
}

function saveSession(uid) { try { localStorage.setItem(SESSION_KEY, JSON.stringify({ uid, savedAt: Date.now() })); } catch (e) {} }
function loadSession() { try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
function saveLastChannel(channel) { try { localStorage.setItem(LAST_CHANNEL_KEY, channel); } catch (e) {} }
function loadLastChannel() { try { return localStorage.getItem(LAST_CHANNEL_KEY); } catch (e) { return null; } }

async function createAccount(rawUsername, password) {
  const username = (rawUsername || "").trim();
  const normalized = normalizeUsername(username);
  if (!isValidUsernameFormat(username)) throw new Error("Username must be 3-16 characters: letters, numbers, and underscores only.");
  if (!password || password.length < 4) throw new Error("Password must be at least 4 characters.");
  if (await isUsernameTaken(normalized)) throw new Error("That username is already taken.");
  const salt = randomSaltHex();
  const passwordHash = await hashPassword(password, salt);
  const newUserRef = push(ref(db, "users"));
  const uid = newUserRef.key;
  const role = normalized === "owner" ? "owner" : "user";
  const userRecord = { username, normalizedUsername: normalized, passwordHash, passwordSalt: salt, displayName: "", bio: "", profilePicture: null, role, blocked: false, mutedUntil: 0, createdAt: serverTimestamp(), personalBlocks: {} };
  await set(newUserRef, userRecord);
  await set(ref(db, `usernames/${normalized}`), uid);
  return uid;
}

async function loginWithCredentials(rawUsername, password) {
  const normalized = normalizeUsername(rawUsername);
  const uidSnap = await get(ref(db, `usernames/${normalized}`));
  if (!uidSnap.exists()) throw new Error("Incorrect username or password.");
  const uid = uidSnap.val();
  const userSnap = await get(ref(db, `users/${uid}`));
  if (!userSnap.exists()) throw new Error("Incorrect username or password.");
  const userRecord = userSnap.val();
  const attemptedHash = await hashPassword(password, userRecord.passwordSalt);
  if (attemptedHash !== userRecord.passwordHash) throw new Error("Incorrect username or password.");
  return { uid, userRecord, blocked: userRecord.blocked };
}

async function bootstrapSession() {
  const session = loadSession();
  if (!session) return showAuthScreen();
  try {
    const userSnap = await get(ref(db, `users/${session.uid}`));
    if (!userSnap.exists()) { clearSession(); return showAuthScreen(); }
    const userRecord = userSnap.val();
    if (userRecord.blocked) {
      state.currentUid = session.uid; state.currentUser = userRecord;
      showBlockedScreen(); watchOwnBlockStatus(session.uid);
      return;
    }
    enterApp(session.uid, userRecord);
  } catch (e) { showAuthScreen(); }
}

function enterApp(uid, userRecord) {
  state.currentUid = uid; state.currentUser = userRecord; saveSession(uid);
  renderUserPanel(); renderChannelList(); setupStaffControls();
  watchOwnBlockStatus(uid); watchOwnMuteStatus(uid); watchOwnRoleChanges(uid); watchBroadcast();
  if (STAFF_ROLES.includes(userRecord.role)) watchBlockRequestsDot();
  loadAllUsersIfNeeded();
  watchDMsList();
  
  const remembered = loadLastChannel();
  const initialChannel = remembered || "general";
  switchChannel(initialChannel);
  showScreen(el.mainApp);
}

function logout() { teardownAllListeners(); clearSession(); state.currentUser = null; state.currentUid = null; showAuthScreen(); }

function teardownAllListeners() {
  for (const unsub of Object.values(state.messageListeners)) try { unsub(); } catch (e) {}
  state.messageListeners = {};
  for (const unsub of state.userListeners) try { unsub(); } catch (e) {}
  state.userListeners = [];
  if (state.muteTimer) clearInterval(state.muteTimer);
  if (state.broadcastTimer) clearTimeout(state.broadcastTimer);
}

function showScreen(screenEl) { [el.loadingScreen, el.authScreen, el.blockedScreen, el.mainApp].forEach((s) => s.classList.toggle("hidden", s !== screenEl)); }
function showLoadingScreen() { showScreen(el.loadingScreen); }
function showAuthScreen() { showScreen(el.authScreen); resetAuthForm(); }
function showBlockedScreen() { showScreen(el.blockedScreen); }

function renderChannelList() {
  clearChildren(el.channelList);
  const role = state.currentUser.role;
  for (const channel of CHANNELS) {
    if (channel === "staff" && !STAFF_ROLES.includes(role)) continue;
    const btn = makeEl("button", { className: "channel-btn" + (channel === state.currentChannel ? " active" : ""), onClick: () => switchChannel(channel) });
    btn.appendChild(makeEl("span", { className: "channel-hash", text: "#" }));
    btn.appendChild(textNode(channel));
    btn.dataset.channel = channel;
    el.channelList.appendChild(btn);
  }
  
  // DMs Tab Pseudo-Channel
  const dmsBtn = makeEl("button", { className: "channel-btn" + (state.currentChannel === "dms_home" ? " active" : ""), onClick: () => switchChannel("dms_home") });
  dmsBtn.appendChild(makeEl("span", { className: "channel-hash", text: "@" }));
  dmsBtn.appendChild(textNode("dms"));
  dmsBtn.dataset.channel = "dms_home";
  el.channelList.appendChild(dmsBtn);
}

function watchDMsList() {
  const r = ref(db, `users/${state.currentUid}/dms`);
  const handler = async (snap) => {
    const dms = snap.val() || {};
    clearChildren(el.dmsList);
    const hasDms = Object.keys(dms).length > 0;
    el.dmsSidebarTitle.classList.toggle("hidden", !hasDms);
    el.dmsList.classList.toggle("hidden", !hasDms);

    for (const dmId of Object.keys(dms)) {
      const dmSnap = await get(ref(db, `dm_threads/${dmId}`));
      if (!dmSnap.exists()) continue;
      const data = dmSnap.val();
      
      let title = data.title;
      if (!title) {
        const others = Object.keys(data.members || {}).filter(u => u !== state.currentUid);
        const names = others.map(u => state.usersCache[u]?.username || u);
        title = names.join(", ");
      }
      if (!title) title = "Unknown DM";

      const btn = makeEl("button", { className: "channel-btn" + (dmId === state.currentChannel ? " active" : ""), onClick: () => switchChannel(dmId) });
      btn.appendChild(makeEl("span", { className: "channel-hash", text: "@" }));
      btn.appendChild(textNode(title));
      btn.dataset.channel = dmId;
      el.dmsList.appendChild(btn);
    }
  };
  onValue(r, handler);
  state.userListeners.push(() => off(r, "value", handler));
}

function switchChannel(channel) {
  const prev = state.messageListeners[state.currentChannel];
  if (prev) { try { prev(); } catch (e) {} delete state.messageListeners[state.currentChannel]; }

  state.currentChannel = channel;
  saveLastChannel(channel);
  state.replyTarget = null;
  updateReplyPreviewUI();
  
  document.querySelectorAll(".channel-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.channel === channel));

  el.dmHomeView.classList.add("hidden");
  el.messagesScroll.classList.remove("hidden");
  el.messageComposer.classList.remove("hidden");
  el.dmHeaderActions.classList.add("hidden");
  el.typingIndicator.classList.add("hidden");
  el.emptyChannelState.classList.add("hidden");
  el.dmBlockBtn.classList.add("hidden");
  el.dmLeaveBtn.classList.add("hidden");

  if (channel === "dms_home") {
    el.channelNameDisplay.textContent = "Direct Messages";
    el.messagesScroll.classList.add("hidden");
    el.messageComposer.classList.add("hidden");
    el.dmHomeView.classList.remove("hidden");
    renderDMSearch("");
  } else if (!CHANNELS.includes(channel) && channel !== "dms_home") {
    // This is a DM thread (Firebase push keys do not start with "dm_")
    get(ref(db, `dm_threads/${channel}`)).then(snap => {
      const data = snap.val();
      if (!data) return;
      const others = Object.keys(data.members || {}).filter(u => u !== state.currentUid);
      const isGroup = others.length > 1;
      el.channelNameDisplay.textContent = data.title || others.map(u => state.usersCache[u]?.username || u).join(", ");
      el.messageInput.placeholder = `Message ${el.channelNameDisplay.textContent}`;
      el.dmHeaderActions.classList.remove("hidden");
      if (isGroup) {
        el.dmBlockBtn.classList.add("hidden");
        el.dmLeaveBtn.classList.remove("hidden");
      } else {
        el.dmBlockBtn.classList.remove("hidden");
        el.dmLeaveBtn.classList.add("hidden");
      }
    });
    el.messagesScroll.classList.remove("hidden");
    clearChildren(el.messagesList);
    attachMessageListener(`messages/${channel}`);
    attachTypingListener(`messages/${channel}`);
  } else {
    el.channelNameDisplay.textContent = `#${channel}`;
    el.messageInput.placeholder = `Message #${channel}`;
    clearChildren(el.messagesList);
    attachMessageListener(`messages/${channel}`);
    attachTypingListener(`messages/${channel}`);
  }
}

async function loadAllUsersIfNeeded() {
  if (state.allUsersLoaded) return;
  const snap = await get(ref(db, "users"));
  const data = snap.val() || {};
  for (const [uid, record] of Object.entries(data)) state.usersCache[uid] = record;
  state.allUsersLoaded = true;
}

el.dmStartSearch.addEventListener("input", () => renderDMSearch(el.dmStartSearch.value.trim().toLowerCase()));
async function renderDMSearch(query) {
  await loadAllUsersIfNeeded();
  clearChildren(el.dmStartResults);
  const entries = Object.entries(state.usersCache)
    .filter(([uid]) => uid !== state.currentUid)
    .filter(([, rec]) => !query || rec.username.toLowerCase().includes(query) || (rec.displayName||"").toLowerCase().includes(query))
    .sort((a, b) => a[1].username.localeCompare(b[1].username));
    
  for (const [uid, record] of entries) {
    const row = makeEl("div", { className: "search-result-item", onClick: () => startDmWithUser(uid) });
    const avatar = document.createElement("img"); avatar.className = "avatar"; avatar.src = safeAvatarSrc(record.profilePicture);
    row.appendChild(avatar);
    row.appendChild(makeEl("span", { text: `${record.displayName || record.username} (@${record.username})` }));
    el.dmStartResults.appendChild(row);
  }
}

async function startDmWithUser(targetUid) {
  const existingDmsSnap = await get(ref(db, `users/${state.currentUid}/dms`));
  const myDms = existingDmsSnap.val() || {};
  let foundDm = null;
  
  for (const dmId of Object.keys(myDms)) {
    const threadSnap = await get(ref(db, `dm_threads/${dmId}`));
    const members = threadSnap.val()?.members || {};
    if (Object.keys(members).length === 2 && members[targetUid]) foundDm = dmId;
  }
  
  if (foundDm) switchChannel(foundDm);
  else {
    const newDmRef = push(ref(db, "dm_threads"));
    const dmId = newDmRef.key;
    await set(newDmRef, { members: { [state.currentUid]: true, [targetUid]: true } });
    await update(ref(db), { [`users/${state.currentUid}/dms/${dmId}`]: true, [`users/${targetUid}/dms/${dmId}`]: true });
    switchChannel(dmId);
  }
}

el.dmAddUserBtn.addEventListener("click", () => {
  el.dmAddSearch.value = "";
  renderDmAddSearch("");
  openModal("modalAddToDm");
});

el.dmAddSearch.addEventListener("input", () => renderDmAddSearch(el.dmAddSearch.value.trim().toLowerCase()));
async function renderDmAddSearch(query) {
  clearChildren(el.dmAddResults);
  const threadSnap = await get(ref(db, `dm_threads/${state.currentChannel}`));
  const members = threadSnap.val()?.members || {};
  
  const entries = Object.entries(state.usersCache)
    .filter(([uid]) => !members[uid])
    .filter(([, rec]) => !query || rec.username.toLowerCase().includes(query) || (rec.displayName||"").toLowerCase().includes(query));
    
  for (const [uid, record] of entries) {
    const row = makeEl("div", { className: "search-result-item", onClick: () => addUserToCurrentDm(uid) });
    const avatar = document.createElement("img"); avatar.className = "avatar"; avatar.src = safeAvatarSrc(record.profilePicture);
    row.appendChild(avatar);
    row.appendChild(makeEl("span", { text: `${record.displayName || record.username} (@${record.username})` }));
    el.dmAddResults.appendChild(row);
  }
}

async function addUserToCurrentDm(uid) {
  await update(ref(db), {
    [`dm_threads/${state.currentChannel}/members/${uid}`]: true,
    [`users/${uid}/dms/${state.currentChannel}`]: true
  });
  closeModals();
  showToast("User added to DM.", "success");
  switchChannel(state.currentChannel);
}

el.dmBlockBtn.addEventListener("click", async () => {
  const threadSnap = await get(ref(db, `dm_threads/${state.currentChannel}`));
  const members = threadSnap.val()?.members || {};
  const others = Object.keys(members).filter(u => u !== state.currentUid);
  if (others.length === 1) {
    const targetUid = others[0];
    const dmId = state.currentChannel;
    await update(ref(db), {
      [`users/${state.currentUid}/personalBlocks/${targetUid}`]: true,
      [`users/${state.currentUid}/dms/${dmId}`]: null
    });
    showToast("User blocked. DM removed from your list.", "success");
    switchChannel("dms_home");
  }
});

el.dmLeaveBtn.addEventListener("click", async () => {
  const dmId = state.currentChannel;
  askConfirm("Leave group?", "You will be removed from this group DM and it will disappear from your list.", async () => {
    await update(ref(db), {
      [`dm_threads/${dmId}/members/${state.currentUid}`]: null,
      [`users/${state.currentUid}/dms/${dmId}`]: null
    });
    showToast("You left the group.", "success");
    switchChannel("dms_home");
  });
});

function attachMessageListener(path) {
  const channelRef = ref(db, path);
  const handler = (snapshot) => {
    const data = snapshot.val() || {};
    const entries = Object.entries(data).sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
    clearChildren(el.messagesList);
    el.emptyChannelState.classList.toggle("hidden", entries.length > 0);
    for (const [msgId, msg] of entries) renderMessage(msgId, msg);
    maybeAutoScroll();
  };
  onValue(channelRef, handler);
  state.messageListeners[state.currentChannel] = () => off(channelRef, "value", handler);
}

function attachTypingListener(path) {
  const typingRef = ref(db, `typing/${state.currentChannel}`);
  const handler = (snap) => {
    const data = snap.val() || {};
    const now = Date.now();
    const typingUsers = Object.entries(data)
      .filter(([uid, ts]) => uid !== state.currentUid && now - ts < 3000)
      .map(([uid]) => state.usersCache[uid]?.username || "Someone");
      
    if (typingUsers.length === 0) el.typingIndicator.classList.add("hidden");
    else {
      el.typingIndicator.classList.remove("hidden");
      if (typingUsers.length > 3) el.typingIndicator.textContent = "Multiple people are typing...";
      else if (typingUsers.length === 1) el.typingIndicator.textContent = `${typingUsers[0]} is typing...`;
      else el.typingIndicator.textContent = `${typingUsers.join(", ")} are typing...`;
    }
  };
  onValue(typingRef, handler);
  state.userListeners.push(() => off(typingRef, "value", handler));
}

function handleTyping() {
  if (!state.currentChannel || state.currentChannel === "dms_home") return;
  set(ref(db, `typing/${state.currentChannel}/${state.currentUid}`), Date.now());
  if (state.typingTimer) clearTimeout(state.typingTimer);
  state.typingTimer = setTimeout(() => remove(ref(db, `typing/${state.currentChannel}/${state.currentUid}`)), 1500);
}
el.messageInput.addEventListener("input", handleTyping);

function formatTimestamp(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? `Today at ${timeStr}` : `${d.toLocaleDateString()} ${timeStr}`;
}

function renderMessage(msgId, msg) {
  const row = makeEl("div", { className: "message-row" });
  row.dataset.msgId = msgId;
  if (msg.replyToAuthorId === state.currentUid && msg.senderId !== state.currentUid) row.classList.add("highlighted-reply");

  const avatarImg = document.createElement("img"); avatarImg.className = "avatar";
  avatarImg.src = safeAvatarSrc(msg.senderProfilePicture); avatarImg.addEventListener("click", () => openUserProfileById(msg.senderId));
  row.appendChild(avatarImg);

  const body = makeEl("div", { className: "message-body" });
  if (msg.replyToId) {
    const replyLine = makeEl("div", { className: "reply-context" });
    replyLine.appendChild(textNode(`↪ ${msg.replyToAuthorName || "someone"}: `));
    replyLine.appendChild(makeEl("span", { text: msg.replyToSnippet || "" }));
    body.appendChild(replyLine);
  }

  const meta = makeEl("div", { className: "message-meta" });
  
  let roleEmoji = "";
  if (msg.senderRole === "owner") roleEmoji = " 💻";
  else if (msg.senderRole === "admin") roleEmoji = " 🛡";
  else if (msg.senderRole === "helper") roleEmoji = " 🛠";
  
  const authorSpan = makeEl("span", { className: "message-author", text: (msg.senderDisplayName || msg.senderUsername) + roleEmoji, onClick: () => openUserProfileById(msg.senderId) });
  meta.appendChild(authorSpan);
  meta.appendChild(makeEl("span", { className: "message-time", text: formatTimestamp(msg.timestamp) }));
  if (msg.edited) meta.appendChild(makeEl("span", { className: "message-edited", text: "(edited)" }));
  body.appendChild(meta);

  body.appendChild(makeEl("div", { className: "message-text", text: msg.text || "" }));
  if (msg.attachment) body.appendChild(renderAttachment(msg.attachment));
  row.appendChild(body);

  const actions = makeEl("div", { className: "message-actions" });
  actions.appendChild(makeEl("button", { className: "icon-btn", text: "Reply", onClick: () => startReply(msgId, msg) }));
  if (msg.senderId === state.currentUid && !msg.attachment) actions.appendChild(makeEl("button", { className: "icon-btn", text: "Edit", onClick: () => startEdit(msgId, msg, row) }));
  if (msg.senderId === state.currentUid || STAFF_ROLES.includes(state.currentUser.role)) actions.appendChild(makeEl("button", { className: "icon-btn", text: "Delete", onClick: () => confirmDeleteMessage(msgId) }));
  row.appendChild(actions);
  el.messagesList.appendChild(row);
}

function renderAttachment(att) {
  const wrap = document.createElement("div");
  const dataUrl = `data:${att.mimeType};base64,${att.base64}`;
  if (att.mimeType.startsWith("image/")) { const img = document.createElement("img"); img.className = "attachment-image"; img.src = dataUrl; img.addEventListener("click", () => window.open(dataUrl, "_blank")); wrap.appendChild(img); return wrap; }
  if (att.mimeType.startsWith("video/")) { const video = document.createElement("video"); video.className = "attachment-video"; video.src = dataUrl; video.controls = true; wrap.appendChild(video); return wrap; }
  if (att.mimeType.startsWith("audio/")) { const audio = document.createElement("audio"); audio.className = "attachment-audio"; audio.src = dataUrl; audio.controls = true; wrap.appendChild(audio); return wrap; }
  if (att.mimeType === "application/pdf") { const iframe = document.createElement("iframe"); iframe.className = "attachment-pdf"; iframe.src = dataUrl; wrap.appendChild(iframe); return wrap; }
  
  const card = makeEl("div", { className: "attachment-file" });
  card.appendChild(makeEl("div", { className: "attachment-file-icon", text: "📄" }));
  const info = makeEl("div", { className: "attachment-file-info" });
  info.appendChild(makeEl("div", { className: "attachment-file-name", text: att.filename || "file" }));
  info.appendChild(makeEl("div", { className: "attachment-file-meta", text: `${att.mimeType} · ${formatBytes(att.size)}` }));
  card.appendChild(info);
  card.appendChild(makeEl("button", { className: "icon-btn", text: "Download", onClick: () => downloadBase64File(att) }));
  wrap.appendChild(card);
  return wrap;
}

function downloadBase64File(att) {
  try {
    const byteChars = atob(att.base64); const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: att.mimeType || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = att.filename || "download";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e) { showToast("Could not reconstruct the file for download.", "error"); }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

el.messagesScroll.addEventListener("scroll", () => {
  const { scrollTop, scrollHeight, clientHeight } = el.messagesScroll;
  state.isNearBottom = scrollHeight - (scrollTop + clientHeight) < 120;
  el.newMessagesBtn.classList.toggle("hidden", state.isNearBottom);
});
function maybeAutoScroll() { if (state.isNearBottom) { el.messagesScroll.scrollTop = el.messagesScroll.scrollHeight; el.newMessagesBtn.classList.add("hidden"); } else el.newMessagesBtn.classList.remove("hidden"); }
el.newMessagesBtn.addEventListener("click", () => { el.messagesScroll.scrollTop = el.messagesScroll.scrollHeight; el.newMessagesBtn.classList.add("hidden"); state.isNearBottom = true; });

async function sendMessage() {
  const text = el.messageInput.value.trim();
  const hasFile = !!state.pendingFile;
  if (!text && !hasFile) return;
  
  const now = Date.now();
  if (now - state.lastMessageTime < 1500) {
    showToast("You are sending messages too quickly.", "error");
    return;
  }
  
  if (text.length > MAX_MSG_LEN) return showToast(`Messages are limited to ${MAX_MSG_LEN} characters.`, "error");
  if (state.currentUser?.mutedUntil > Date.now()) return showToast("You're muted and can't send messages right now.", "error");
  
  if (!CHANNELS.includes(state.currentChannel) && state.currentChannel !== "dms_home") {
    const threadSnap = await get(ref(db, `dm_threads/${state.currentChannel}`));
    const members = threadSnap.val()?.members || {};
    for (const uid of Object.keys(members)) {
      if (uid !== state.currentUid) {
        const theirSnap = await get(ref(db, `users/${uid}/personalBlocks/${state.currentUid}`));
        if (theirSnap.exists() && theirSnap.val() === true) return showToast("You cannot send messages to this user.", "error");
      }
    }
  }

  state.lastMessageTime = now;
  const user = state.currentUser;
  const path = `messages/${state.currentChannel}`;
  const msgRef = push(ref(db, path));

  const payload = {
    senderId: state.currentUid, senderUsername: user.username, senderDisplayName: user.displayName || user.username, senderProfilePicture: user.profilePicture || null, senderRole: user.role, channel: state.currentChannel, text, timestamp: Date.now(), serverTime: serverTimestamp(), edited: false,
  };

  if (state.replyTarget) { payload.replyToId = state.replyTarget.id; payload.replyToAuthorId = state.replyTarget.authorId; payload.replyToAuthorName = state.replyTarget.authorName; payload.replyToSnippet = state.replyTarget.snippet; }
  if (hasFile) payload.attachment = { filename: state.pendingFile.name, mimeType: state.pendingFile.type || "application/octet-stream", size: state.pendingFile.size, base64: state.pendingFile.base64, uploadedAt: Date.now() };

  try {
    await set(msgRef, payload);
    el.messageInput.value = ""; autoResizeTextarea(); clearReply(); clearPendingFile();
    remove(ref(db, `typing/${state.currentChannel}/${state.currentUid}`));
  } catch (e) { showToast("Failed to send message.", "error"); }
}

el.sendBtn.addEventListener("click", sendMessage);
el.messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
el.messageInput.addEventListener("input", autoResizeTextarea);
function autoResizeTextarea() { el.messageInput.style.height = "auto"; el.messageInput.style.height = Math.min(el.messageInput.scrollHeight, 160) + "px"; }

function startReply(msgId, msg) {
  const snippet = (msg.text || (msg.attachment ? `[${msg.attachment.filename}]` : "")).slice(0, 80);
  state.replyTarget = { id: msgId, authorId: msg.senderId, authorName: msg.senderDisplayName || msg.senderUsername, snippet: snippet.length === 80 ? snippet + "…" : snippet };
  updateReplyPreviewUI(); el.messageInput.focus();
}
function clearReply() { state.replyTarget = null; updateReplyPreviewUI(); }
function updateReplyPreviewUI() {
  if (!state.replyTarget) { el.replyPreview.classList.add("hidden"); return; }
  el.replyPreview.classList.remove("hidden"); el.replyPreviewName.textContent = state.replyTarget.authorName; el.replyPreviewSnippet.textContent = state.replyTarget.snippet;
}
el.cancelReplyBtn.addEventListener("click", clearReply);

function startEdit(msgId, msg, rowEl) {
  const textDiv = rowEl.querySelector(".message-text"); if (!textDiv) return;
  const textarea = document.createElement("textarea"); textarea.className = "field-input"; textarea.value = msg.text || ""; textarea.maxLength = MAX_MSG_LEN; textarea.rows = 2;
  const controls = makeEl("div", { className: "reply-preview", attrs: { style: "margin:6px 0 0 0;" } });
  const saveBtn = makeEl("button", { className: "btn btn-primary", text: "Save", attrs: { style: "padding:5px 12px;font-size:12px;" } });
  const cancelBtn = makeEl("button", { className: "btn btn-secondary", text: "Cancel", attrs: { style: "padding:5px 12px;font-size:12px;margin-left:6px;" } });
  controls.appendChild(saveBtn); controls.appendChild(cancelBtn);
  clearChildren(textDiv); textDiv.appendChild(textarea); textDiv.appendChild(controls); textarea.focus();

  const finishEdit = async (save) => {
    if (save) {
      const newText = textarea.value.trim();
      if (!newText || newText.length > MAX_MSG_LEN) return showToast("Invalid edit.", "error");
      const path = `messages/${state.currentChannel}/${msgId}`;
      await update(ref(db, path), { text: newText, edited: true });
    }
  };
  saveBtn.addEventListener("click", () => finishEdit(true)); cancelBtn.addEventListener("click", () => finishEdit(false));
}

function confirmDeleteMessage(msgId) {
  askConfirm("Delete message?", "This can't be undone.", async () => {
    const path = `messages/${state.currentChannel}/${msgId}`;
    await remove(ref(db, path));
  });
}

el.fileUploadBtn.addEventListener("click", () => el.fileInput.click());
el.fileInput.addEventListener("change", async () => {
  const file = el.fileInput.files[0]; el.fileInput.value = ""; if (!file) return;
  if (file.size > MAX_FILE_BYTES) return showToast(`File too large. Max size is ${formatBytes(MAX_FILE_BYTES)}.`, "error");
  try {
    const base64 = await fileToBase64(file);
    if (base64.length * 0.75 > MAX_FILE_BYTES * 1.4) return showToast("File is too large.", "error");
    state.pendingFile = { name: file.name, type: file.type, size: file.size, base64 };
    renderFilePreview();
  } catch (e) { showToast("Could not read that file.", "error"); }
});
function fileToBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => { const res = reader.result; resolve(res.slice(res.indexOf(",") + 1)); }; reader.onerror = reject; reader.readAsDataURL(file); }); }
function renderFilePreview() { if (!state.pendingFile) { el.filePreview.classList.add("hidden"); return clearChildren(el.filePreview); } clearChildren(el.filePreview); el.filePreview.classList.remove("hidden"); el.filePreview.appendChild(makeEl("span", { text: `${state.pendingFile.name} (${formatBytes(state.pendingFile.size)})` })); el.filePreview.appendChild(makeEl("button", { className: "icon-btn", text: "Remove", onClick: clearPendingFile })); }
function clearPendingFile() { state.pendingFile = null; renderFilePreview(); }

function renderUserPanel() { const user = state.currentUser; el.userPanelAvatar.src = safeAvatarSrc(user.profilePicture); el.userPanelName.textContent = user.displayName || user.username; el.userPanelRole.textContent = user.role !== "user" ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : ""; }
el.profileBtn.addEventListener("click", () => { const user = state.currentUser; el.profileDisplayName.value = user.displayName || ""; el.profileBio.value = user.bio || ""; el.dnCounter.textContent = `${el.profileDisplayName.value.length}/${MAX_DISPLAY_NAME_LEN}`; el.bioCounter.textContent = `${el.profileBio.value.length}/${MAX_BIO_LEN}`; el.profileError.classList.add("hidden"); openModal("modalProfile"); });
el.profileSaveBtn.addEventListener("click", async () => { const dn = el.profileDisplayName.value.trim(), bio = el.profileBio.value.trim(); if (dn.length > MAX_DISPLAY_NAME_LEN || bio.length > MAX_BIO_LEN) return; await update(ref(db, `users/${state.currentUid}`), { displayName: dn, bio }); state.currentUser.displayName = dn; state.currentUser.bio = bio; renderUserPanel(); closeModals(); showToast("Profile updated.", "success"); });
async function openUserProfileById(uid) { if (!uid) return; let record = state.usersCache[uid]; if (!record) { const snap = await get(ref(db, `users/${uid}`)); if (!snap.exists()) return; record = snap.val(); state.usersCache[uid] = record; } el.vpAvatar.src = safeAvatarSrc(record.profilePicture); el.vpDisplayName.textContent = record.displayName || record.username; el.vpUsername.textContent = `@${record.username}`; el.vpRole.textContent = record.role !== "user" ? record.role.toUpperCase() : ""; el.vpBio.textContent = record.bio || ""; openModal("modalViewProfile"); }

// Profile picture upload
el.userPanelAvatarBtn.addEventListener("click", () => el.avatarInput.click());
el.avatarInput.addEventListener("change", async () => {
  const file = el.avatarInput.files[0];
  el.avatarInput.value = "";
  if (!file || !file.type.startsWith("image/")) return showToast("Please select an image file.", "error");
  try {
    const dataUrl = await resizeImageToDataUrl(file, MAX_AVATAR_DIMENSION);
    await update(ref(db, `users/${state.currentUid}`), { profilePicture: dataUrl });
    state.currentUser.profilePicture = dataUrl;
    renderUserPanel();
    showToast("Profile picture updated.", "success");
  } catch (e) {
    showToast("Failed to update profile picture.", "error");
  }
});

function resizeImageToDataUrl(file, maxDim) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

function watchOwnBlockStatus(uid) { const r = ref(db, `users/${uid}/blocked`); const handler = (snap) => { if (snap.val()) { teardownAllListeners(); watchOwnBlockStatus(uid); showBlockedScreen(); } else if (state.currentUser && !el.blockedScreen.classList.contains("hidden")) { get(ref(db, `users/${uid}`)).then(s => s.exists() && enterApp(uid, s.val())); } }; onValue(r, handler); state.userListeners.push(() => off(r, "value", handler)); }
function watchOwnMuteStatus(uid) { const r = ref(db, `users/${uid}/mutedUntil`); const handler = (snap) => { state.currentUser.mutedUntil = snap.val() || 0; updateMuteUI(); }; onValue(r, handler); state.userListeners.push(() => off(r, "value", handler)); if(state.muteTimer) clearInterval(state.muteTimer); state.muteTimer = setInterval(updateMuteUI, 1000); }
function updateMuteUI() { const muted = state.currentUser?.mutedUntil > Date.now(); el.muteNotice.classList.toggle("hidden", !muted); el.sendBtn.disabled = muted; el.messageInput.disabled = muted; if (muted) el.muteRemaining.textContent = ` (${Math.ceil((state.currentUser.mutedUntil - Date.now()) / 1000)}s)`; }
function watchOwnRoleChanges(uid) { const r = ref(db, `users/${uid}/role`); const handler = (snap) => { const newRole = snap.val(); if (!newRole || newRole === state.currentUser.role) return; state.currentUser.role = newRole; renderUserPanel(); renderChannelList(); setupStaffControls(); if (state.currentChannel === "staff" && !STAFF_ROLES.includes(newRole)) switchChannel("general"); showToast(`Your role is now ${newRole}.`, "info"); }; onValue(r, handler); state.userListeners.push(() => off(r, "value", handler)); }

function setupStaffControls() { clearChildren(el.staffControls); if (!STAFF_ROLES.includes(state.currentUser.role)) return; const btn = makeEl("button", { className: "icon-btn", text: "Staff", onClick: () => { el.staffBroadcastBtn.classList.toggle("hidden", !["owner","admin"].includes(state.currentUser.role)); el.staffUsermanagerBtn.classList.toggle("hidden", !STAFF_ROLES.includes(state.currentUser.role)); el.staffBlockrequestsBtn.classList.toggle("hidden", !["owner","admin"].includes(state.currentUser.role)); openModal("modalStaffMenu"); } }); el.staffControls.appendChild(btn); }

// Staff menu button listeners
el.staffBroadcastBtn.addEventListener("click", () => {
  el.broadcastMessage.value = "";
  el.broadcastDuration.value = "8";
  el.broadcastCounter.textContent = "0/300";
  el.broadcastError.classList.add("hidden");
  openModal("modalBroadcast");
});
el.staffUsermanagerBtn.addEventListener("click", () => {
  el.userSearchInput.value = "";
  clearChildren(el.userSearchResults);
  openModal("modalUsermanager");
  renderUserSearchResults("");
});
el.staffBlockrequestsBtn.addEventListener("click", () => {
  openModal("modalBlockRequests");
  loadBlockRequests();
});

// Broadcast
el.broadcastMessage.addEventListener("input", () => {
  el.broadcastCounter.textContent = `${el.broadcastMessage.value.length}/300`;
});
el.broadcastSendBtn.addEventListener("click", async () => {
  const msg = el.broadcastMessage.value.trim();
  const dur = parseInt(el.broadcastDuration.value, 10);
  if (!msg) return showToast("Message required.", "error");
  if (msg.length > MAX_BROADCAST_LEN) return showToast("Message too long.", "error");
  if (isNaN(dur) || dur < MIN_BROADCAST_SEC || dur > MAX_BROADCAST_SEC) return showToast("Duration must be 3-20 seconds.", "error");
  const expiresAt = Date.now() + dur * 1000;
  await set(ref(db, "broadcast/current"), { message: msg, expiresAt, sentBy: state.currentUid, sentAt: Date.now() });
  closeModals();
  showToast("Broadcast sent.", "success");
});

// User Manager search
el.userSearchInput.addEventListener("input", () => renderUserSearchResults(el.userSearchInput.value.trim().toLowerCase()));
async function renderUserSearchResults(query) {
  await loadAllUsersIfNeeded();
  clearChildren(el.userSearchResults);
  const entries = Object.entries(state.usersCache)
    .filter(([, rec]) => !query || rec.username.toLowerCase().includes(query) || (rec.displayName || "").toLowerCase().includes(query))
    .sort((a, b) => a[1].username.localeCompare(b[1].username));
  for (const [uid, record] of entries) {
    const row = makeEl("div", { className: "user-result-row", onClick: () => openManageUser(uid) });
    const avatar = document.createElement("img"); avatar.className = "avatar"; avatar.src = safeAvatarSrc(record.profilePicture);
    row.appendChild(avatar);
    const info = makeEl("div", { className: "user-result-info" });
    info.appendChild(makeEl("div", { className: "user-result-name", text: record.displayName || record.username }));
    info.appendChild(makeEl("div", { className: "user-result-sub", text: `@${record.username} · ${record.role}` }));
    row.appendChild(info);
    el.userSearchResults.appendChild(row);
  }
}

async function openManageUser(uid) {
  state.activeManagedUid = uid;
  let record = state.usersCache[uid];
  if (!record) {
    const snap = await get(ref(db, `users/${uid}`));
    if (!snap.exists()) return;
    record = snap.val();
    state.usersCache[uid] = record;
  }
  el.muAvatar.src = safeAvatarSrc(record.profilePicture);
  el.muDisplayName.textContent = record.displayName || record.username;
  el.muUsername.textContent = `@${record.username}`;
  clearChildren(el.muActions);

  const myRole = state.currentUser.role;
  const targetRole = record.role;

  // Mute
  if (["owner", "admin", "helper"].includes(myRole)) {
    const muteBtn = makeEl("button", { className: "btn btn-secondary btn-block", text: "Mute (60s)", onClick: async () => {
      await update(ref(db, `users/${uid}`), { mutedUntil: Date.now() + 60000 });
      showToast("User muted for 60 seconds.", "success");
      closeModals();
    }});
    el.muActions.appendChild(muteBtn);
  }

  // Block / Unblock (owner/admin only)
  if (["owner", "admin"].includes(myRole)) {
    if (record.blocked) {
      const unblockBtn = makeEl("button", { className: "btn btn-secondary btn-block", text: "Unblock", onClick: async () => {
        await update(ref(db, `users/${uid}`), { blocked: false });
        showToast("User unblocked.", "success");
        closeModals();
      }});
      el.muActions.appendChild(unblockBtn);
    } else {
      const blockBtn = makeEl("button", { className: "btn btn-danger btn-block", text: "Block", onClick: async () => {
        await update(ref(db, `users/${uid}`), { blocked: true });
        showToast("User blocked.", "success");
        closeModals();
      }});
      el.muActions.appendChild(blockBtn);
    }
  }

  // Role changes (owner only)
  if (myRole === "owner" && uid !== state.currentUid) {
    for (const role of ["user", "helper", "admin"]) {
      if (role === targetRole) continue;
      const roleBtn = makeEl("button", { className: "btn btn-secondary btn-block", text: `Set role: ${role}`, onClick: async () => {
        await update(ref(db, `users/${uid}`), { role });
        showToast(`Role set to ${role}.`, "success");
        closeModals();
      }});
      el.muActions.appendChild(roleBtn);
    }
  }

  openModal("modalManageUser");
}

// Block Requests
async function loadBlockRequests() {
  clearChildren(el.blockRequestsList);
  const snap = await get(ref(db, "blockRequests"));
  const data = snap.val() || {};
  const keys = Object.keys(data);
  el.blockRequestsEmpty.classList.toggle("hidden", keys.length > 0);
  for (const reqId of keys) {
    const req = data[reqId];
    const card = makeEl("div", { className: "block-request-card" });
    card.appendChild(makeEl("div", { className: "br-target", text: `Target: ${req.targetUsername || req.targetUid}` }));
    card.appendChild(makeEl("div", { text: `Reason: ${req.reason || "—"}` }));
    card.appendChild(makeEl("div", { text: `Requested by: ${req.requesterUsername || req.requesterUid}` }));
    const actions = makeEl("div", { className: "mu-actions", attrs: { style: "margin-top:8px;" } });
    const approve = makeEl("button", { className: "btn btn-danger", text: "Approve & Block", onClick: async () => {
      await update(ref(db, `users/${req.targetUid}`), { blocked: true });
      await remove(ref(db, `blockRequests/${reqId}`));
      showToast("User blocked.", "success");
      loadBlockRequests();
    }});
    const deny = makeEl("button", { className: "btn btn-secondary", text: "Deny", onClick: async () => {
      await remove(ref(db, `blockRequests/${reqId}`));
      showToast("Request denied.", "info");
      loadBlockRequests();
    }});
    actions.appendChild(approve);
    actions.appendChild(deny);
    card.appendChild(actions);
    el.blockRequestsList.appendChild(card);
  }
}

function watchBroadcast() { const r = ref(db, "broadcast/current"); const handler = (snap) => { const data = snap.val(); if (state.broadcastTimer) clearTimeout(state.broadcastTimer); if (!data || data.expiresAt <= Date.now()) return el.broadcastBanner.classList.add("hidden"); el.broadcastText.textContent = data.message; el.broadcastBanner.classList.remove("hidden"); state.broadcastTimer = setTimeout(() => el.broadcastBanner.classList.add("hidden"), data.expiresAt - Date.now()); }; onValue(r, handler); state.userListeners.push(() => off(r, "value", handler)); }
function watchBlockRequestsDot() { const r = ref(db, "blockRequests"); const handler = (snap) => { el.blockRequestsDot.classList.toggle("hidden", !(snap.exists() && Object.keys(snap.val()||{}).length > 0 && ["owner","admin"].includes(state.currentUser.role))); }; onValue(r, handler); state.userListeners.push(() => off(r, "value", handler)); }

let authMode = "login";
function resetAuthForm() { el.authUsername.value = ""; el.authPassword.value = ""; el.authError.classList.add("hidden"); setAuthMode("login"); }
function setAuthMode(mode) { authMode = mode; el.tabLogin.classList.toggle("active", mode === "login"); el.tabSignup.classList.toggle("active", mode === "signup"); el.authSubmitLabel.textContent = mode === "login" ? "Log In" : "Create Account"; el.authError.classList.add("hidden"); }
el.tabLogin.addEventListener("click", () => setAuthMode("login")); el.tabSignup.addEventListener("click", () => setAuthMode("signup"));
el.authForm.addEventListener("submit", async (e) => { e.preventDefault(); const username = el.authUsername.value.trim(); const password = el.authPassword.value; el.authError.classList.add("hidden"); if (!username || !password) return showAuthError("Please enter a username and password."); el.authSubmit.disabled = true; el.authSubmitSpinner.classList.remove("hidden"); el.authSubmitLabel.classList.add("hidden"); try { if (authMode === "signup") { const uid = await createAccount(username, password); enterApp(uid, (await get(ref(db, `users/${uid}`))).val()); } else { const { uid, userRecord, blocked } = await loginWithCredentials(username, password); if (blocked) { state.currentUid = uid; state.currentUser = userRecord; saveSession(uid); showBlockedScreen(); watchOwnBlockStatus(uid); } else enterApp(uid, userRecord); } } catch (err) { el.authError.textContent = err.message || "Error."; el.authError.classList.remove("hidden"); } finally { el.authSubmit.disabled = false; el.authSubmitSpinner.classList.add("hidden"); el.authSubmitLabel.classList.remove("hidden"); } });
function showAuthError(msg) { el.authError.textContent = msg; el.authError.classList.remove("hidden"); }
el.logoutBtn.addEventListener("click", logout); el.blockedLogoutBtn.addEventListener("click", logout);

onValue(ref(db, ".info/connected"), (snap) => { const connected = snap.val() === true; el.statusDot.className = "status-dot " + (connected ? "connected" : "reconnecting"); el.statusLabel.textContent = connected ? "Connected" : "Reconnecting…"; });
el.sidebarToggle.addEventListener("click", () => el.sidebar.classList.toggle("open")); el.mobileSidebarBtn.addEventListener("click", () => el.sidebar.classList.toggle("open"));

showLoadingScreen();
bootstrapSession();
