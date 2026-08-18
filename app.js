import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getDatabase, ref, push, onValue, serverTimestamp, get, child, set, update, remove, query, limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAyR3YYB0BP9wNOsBc7Kcs57KbJcbTpRTo",
  authDomain: "thenewdiscisdead.firebaseapp.com",
  projectId: "thenewdiscisdead",
  storageBucket: "thenewdiscisdead.firebasestorage.app",
  messagingSenderId: "1031346102402",
  appId: "1:1031346102402:web:7fae429231e82fa78d149b",
  measurementId: "G-Q1K6WTG06F"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app); 
const dbRef = ref(db);

const DEFAULT_PFP = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23999'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/%3E%3C/svg%3E";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// DOM
const authScreen = document.getElementById('auth-screen');
const chatScreen = document.getElementById('chat-screen');
const blockedScreen = document.getElementById('blocked-screen');
const usernameInput = document.getElementById('username'); 
const passwordInput = document.getElementById('password');
const authError = document.getElementById('auth-error');
const currentPfpImg = document.getElementById('current-pfp');
const currentUserSpan = document.getElementById('current-user');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages-container');
const fileUpload = document.getElementById('file-upload');
const filePreview = document.getElementById('file-preview');
const filePreviewName = document.getElementById('file-preview-name');
const chatError = document.getElementById('chat-error');
const typingIndicator = document.getElementById('typing-indicator');

// Admin / Profile / Tools
const dmSearchInput = document.getElementById('dm-search-input');
const dmSearchResults = document.getElementById('dm-search-results');
const dmChannelsList = document.getElementById('dm-channels-list');
const openAdminBtn = document.getElementById('open-admin-btn');
const adminModal = document.getElementById('admin-modal');
const closeAdminBtn = document.getElementById('close-admin-btn');
const announceText = document.getElementById('announce-text');
const announceDuration = document.getElementById('announce-duration');
const sendAnnounceBtn = document.getElementById('send-announce-btn');
const announcementBanner = document.getElementById('announcement-banner');
const announcementTextDisplay = document.getElementById('announcement-text');
const dmBlockToggleBtn = document.getElementById('dm-block-toggle-btn');
const replyBanner = document.getElementById('reply-banner');
const replyToName = document.getElementById('reply-to-name');
const replyToText = document.getElementById('reply-to-text');
const cancelReplyBtn = document.getElementById('cancel-reply-btn');

let unsubscribeMessages = null;
let unsubscribeTyping = null;
let unsubscribeUser = null;
let unsubscribeBlockStatus = null;
let currentActiveUser = null;
let currentUserData = {};
let currentChannel = "main";
let currentChannelType = "text"; 
let currentDMTarget = null;
let isCurrentDMBlocked = false;
let adminTargetUser = null;
let adminTargetUserData = null;
let announceTimeout = null;
let attachedFileData = null;
let currentReplyContext = null;
let typingTimeout = null;
let lastMessageTime = 0;

if ("Notification" in window && Notification.permission !== "granted") Notification.requestPermission();
function showDesktopNotification(title, body) {
  if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, icon: currentUserData.pfp || DEFAULT_PFP });
}

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = (error) => reject(error);
});

async function logUserIn(username) {
  currentActiveUser = username;
  
  if (unsubscribeBlockStatus) unsubscribeBlockStatus();
  unsubscribeBlockStatus = onValue(ref(db, `blocked_users/${username}`), (snap) => {
    if (snap.exists() && snap.val() === true) {
      authScreen.classList.add('hidden'); chatScreen.classList.add('hidden'); blockedScreen.classList.remove('hidden');
    } else {
      blockedScreen.classList.add('hidden');
      if (currentActiveUser) { authScreen.classList.add('hidden'); chatScreen.classList.remove('hidden'); }
    }
  });

  // Verify Account Integrity (Handles Wipe Transitions seamlessly)
  if (unsubscribeUser) unsubscribeUser();
  unsubscribeUser = onValue(ref(db, `users/${username}`), (snap) => {
    if (snap.exists() && snap.val().wipedTo) {
      const newUsername = snap.val().wipedTo;
      localStorage.setItem('obh_session', newUsername);
      alert(`Your account has been wiped by staff. Your new username is @${newUsername}`);
      logUserIn(newUsername);
    } else if (!snap.exists() && currentActiveUser === username) {
      alert("Your account state has changed. Please log in again.");
      document.getElementById('logout-btn').click();
    } else if (snap.exists()) {
      currentUserData = snap.val();
      if(!currentUserData.pfp) currentUserData.pfp = DEFAULT_PFP;
      updateUIAfterLogin(username);
    }
  });

  loadUserDMs();
  switchChannel('main', 'text');
}

function updateUIAfterLogin(username) {
  currentPfpImg.src = currentUserData.pfp || DEFAULT_PFP;
  let badges = (username === 'thecoolwebsitemaker') ? ' <span class="dev-badge" title="Web Developer">💻</span>' : '';
  if (currentUserData.isStaff) badges += ' <span class="staff-badge" title="Staff">🛡️</span>';
  currentUserSpan.innerHTML = (currentUserData.displayName || username) + badges;
  
  if (currentUserData.isStaff || username === 'thecoolwebsitemaker') {
    openAdminBtn.classList.remove('hidden');
    if (username === 'thecoolwebsitemaker') {
      document.getElementById('owner-tools').classList.remove('hidden');
      document.getElementById('admin-revoke-btn').classList.remove('hidden');
    }
  } else {
    openAdminBtn.classList.add('hidden');
  }
}

const savedSession = localStorage.getItem('obh_session');
if (savedSession) logUserIn(savedSession);

// LOGIN LOGIC
document.getElementById('login-btn').addEventListener('click', async (e) => {
  e.preventDefault();
  authError.textContent = 'Checking...';
  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  if (!username || !password) return (authError.textContent = "Enter both fields.");

  try {
    const snap = await get(child(dbRef, `users/${username}`));
    if (snap.exists()) {
      if (snap.val().wipedTo) {
        authError.textContent = `This account was wiped. Try logging in as: ${snap.val().wipedTo}`;
        return;
      }
      if (snap.val().password === password) {
        localStorage.setItem('obh_session', username); authError.textContent = ''; logUserIn(username);
        return;
      }
    }
    authError.textContent = "Incorrect username or password.";
  } catch (error) { authError.textContent = "Database error."; }
});

// SIGNUP LOGIC (Added 16 char limit check for username)
document.getElementById('signup-btn').addEventListener('click', async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const ageGroup = document.getElementById('age-group');
  const loginFields = document.getElementById('login-fields');
  const loginBtn = document.getElementById('login-btn');
  const signupBtn = document.getElementById('signup-btn');

  if (ageGroup.classList.contains('hidden')) {
    if (username.length < 3 || username.length > 16) {
      authError.textContent = "Username must be between 3 and 16 characters.";
      return;
    }
    if (password.length < 4) {
      authError.textContent = "Password must be at least 4 characters.";
      return;
    }
    authError.textContent = "Checking username...";
    try {
      const snapshot = await get(child(dbRef, `users/${username}`));
      if (snapshot.exists()) return (authError.textContent = "Username taken.");
      authError.textContent = "";
      loginFields.classList.add('hidden');
      loginBtn.classList.add('hidden');
      ageGroup.classList.remove('hidden');
      signupBtn.textContent = "Complete Account";
    } catch (e) { authError.textContent = "Database error."; }
  } else {
    authError.textContent = "Creating account...";
    const age = document.getElementById('age-select').value;
    try {
      await set(ref(db, `users/${username}`), { 
        password, pfp: DEFAULT_PFP, age, isStaff: false, displayName: "", bio: "", createdAt: serverTimestamp() 
      });
      localStorage.setItem('obh_session', username);
      authError.textContent = '';
      logUserIn(username);
      
      loginFields.classList.remove('hidden');
      loginBtn.classList.remove('hidden');
      ageGroup.classList.add('hidden');
      signupBtn.textContent = "Create Account";
    } catch (error) { authError.textContent = "Database error."; }
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('obh_session');
  currentActiveUser = null; currentUserData = {};
  authScreen.classList.remove('hidden'); chatScreen.classList.add('hidden'); blockedScreen.classList.add('hidden');
  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeTyping) unsubscribeTyping();
  if (unsubscribeUser) { unsubscribeUser(); unsubscribeUser = null; }
  if (unsubscribeBlockStatus) { unsubscribeBlockStatus(); unsubscribeBlockStatus = null; }
});

// Profile Editing (Added Display Name & Bio limits)
document.getElementById('edit-profile-btn').addEventListener('click', () => {
  document.getElementById('display-name-input').value = currentUserData?.displayName || "";
  document.getElementById('bio-input').value = currentUserData?.bio || "";
  document.getElementById('profile-modal').classList.remove('hidden');
});

document.getElementById('cancel-profile-btn').addEventListener('click', () => {
  document.getElementById('profile-modal').classList.add('hidden');
});

document.getElementById('save-profile-btn').addEventListener('click', async () => {
  const newDisplayName = document.getElementById('display-name-input').value.trim();
  const newBio = document.getElementById('bio-input').value.trim();
  
  if (newDisplayName.length > 16) {
    return alert("Display name cannot exceed 16 characters.");
  }
  if (newBio.length > 750) {
    return alert("Bio cannot exceed 750 characters.");
  }

  try {
    await update(ref(db, `users/${currentActiveUser}`), { displayName: newDisplayName, bio: newBio });
    document.getElementById('profile-modal').classList.add('hidden');
  } catch(err) { alert("Failed to save profile."); }
});

document.getElementById('pfp-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !currentActiveUser) return;
  if (file.size > MAX_FILE_SIZE) return alert("PFP must be under 5MB.");
  try {
    const base64 = await fileToBase64(file);
    await update(ref(db, `users/${currentActiveUser}`), { pfp: base64 });
  } catch (err) { console.error(err); }
});

// Admin Panel Logic
openAdminBtn.addEventListener('click', async () => {
  adminModal.classList.remove('hidden');
  const staffSelect = document.getElementById('staff-roster-select');
  staffSelect.innerHTML = '<option value="">-- View Current Staff --</option>';
  const snap = await get(child(dbRef, 'users'));
  snap.forEach(user => {
    if(user.val().isStaff && !user.val().wipedTo) staffSelect.innerHTML += `<option value="${user.key}">@${user.key} ${user.val().displayName ? `(${user.val().displayName})` : ''}</option>`;
  });
  if(currentActiveUser === 'thecoolwebsitemaker') loadGeneratedCodes();
});

closeAdminBtn.addEventListener('click', () => adminModal.classList.add('hidden'));

// Announcements
sendAnnounceBtn.addEventListener('click', async () => {
  const text = announceText.value.trim();
  const dur = parseInt(announceDuration.value);
  if(!text) return;
  await set(ref(db, 'global_events/announcement'), { text, expiresAt: Date.now() + (dur * 1000) });
  announceText.value = '';
});

onValue(ref(db, 'global_events/announcement'), (snap) => {
  if(!snap.exists()) return;
  const data = snap.val();
  if(Date.now() < data.expiresAt) {
    announcementTextDisplay.textContent = data.text;
    announcementBanner.classList.remove('hidden');
    clearTimeout(announceTimeout);
    announceTimeout = setTimeout(() => announcementBanner.classList.add('hidden'), data.expiresAt - Date.now());
  }
});

// User Management Search
document.getElementById('admin-search-btn').addEventListener('click', async () => {
  const search = document.getElementById('admin-user-search').value.trim().toLowerCase();
  const snap = await get(child(dbRef, `users/${search}`));
  if(snap.exists() && !snap.val().wipedTo) {
    adminTargetUser = search;
    adminTargetUserData = snap.val();
    document.getElementById('target-user-display').textContent = `Target: @${search}`;
    document.getElementById('admin-user-actions').classList.remove('hidden');
  } else {
    alert("User not found.");
    adminTargetUser = null;
    adminTargetUserData = null;
    document.getElementById('admin-user-actions').classList.add('hidden');
  }
});

function canPerformActionOnTarget() {
  if (!adminTargetUser) return false;
  if (adminTargetUser === 'thecoolwebsitemaker' && currentActiveUser !== 'thecoolwebsitemaker') {
    alert("Action denied: You cannot target the site owner.");
    return false;
  }
  if (currentActiveUser !== 'thecoolwebsitemaker') {
    if (adminTargetUser === 'thecoolwebsitemaker' || (adminTargetUserData && adminTargetUserData.isStaff)) {
      alert("Action denied: Staff members cannot mute, block, or wipe the owner or other staff members.");
      return false;
    }
  }
  return true;
}

document.getElementById('admin-mute-btn').addEventListener('click', async () => {
  const mins = parseInt(document.getElementById('mute-duration').value);
  if(!canPerformActionOnTarget() || isNaN(mins)) return;
  await update(ref(db, `users/${adminTargetUser}`), { mutedUntil: Date.now() + (mins * 60000) });
  alert(`@${adminTargetUser} muted for ${mins} minutes.`);
});

document.getElementById('admin-wipe-btn').addEventListener('click', async () => {
  if(!canPerformActionOnTarget()) return;
  if(!confirm(`Are you sure you want to wipe @${adminTargetUser}?`)) return;
  const rand = Math.random().toString(36).substring(2, 8);
  const newUname = 'user_' + rand;
  const oldData = adminTargetUserData;
  
  await set(ref(db, `users/${newUname}`), { ...oldData, displayName: "", bio: "", pfp: DEFAULT_PFP, isStaff: false });
  await set(ref(db, `users/${adminTargetUser}`), { wipedTo: newUname });
  
  alert(`Account wiped. New username: ${newUname}`);
  document.getElementById('admin-user-actions').classList.add('hidden');
});

document.getElementById('admin-block-btn').addEventListener('click', async () => {
  if(!canPerformActionOnTarget()) return;
  await set(ref(db, `blocked_users/${adminTargetUser}`), true);
  alert(`@${adminTargetUser} blocked from the site.`);
});

document.getElementById('admin-revoke-btn').addEventListener('click', async () => {
  if(!adminTargetUser || currentActiveUser !== 'thecoolwebsitemaker') return;
  if(adminTargetUser === 'thecoolwebsitemaker') return alert("You cannot revoke the owner's privileges.");
  await update(ref(db, `users/${adminTargetUser}`), { isStaff: false });
  alert(`Staff privileges revoked from @${adminTargetUser}.`);
});

// Owner Tools
async function loadGeneratedCodes() {
  const codesSelect = document.getElementById('generated-codes-select');
  codesSelect.innerHTML = '<option value="">-- Active & Used Codes --</option>';
  
  const activeStaffSnap = await get(child(dbRef, 'generated_codes/active/staff'));
  if(activeStaffSnap.exists()) {
    activeStaffSnap.forEach(c => {
      codesSelect.innerHTML += `<option>[ACTIVE STAFF] ${c.key}</option>`;
    });
  }
  
  const activeUnblockSnap = await get(child(dbRef, 'generated_codes/active/unblock'));
  if(activeUnblockSnap.exists()) {
    activeUnblockSnap.forEach(c => {
      codesSelect.innerHTML += `<option>[ACTIVE UNBLOCK] ${c.key}</option>`;
    });
  }

  const usedSnap = await get(child(dbRef, 'generated_codes/used'));
  if(usedSnap.exists()) {
    usedSnap.forEach(c => {
      const data = c.val();
      codesSelect.innerHTML += `<option>[USED (${data.type.toUpperCase()})] ${c.key} - By: @${data.usedBy}</option>`;
    });
  }
}

document.getElementById('gen-staff-code-btn').addEventListener('click', async () => {
  const code = 'staffaccess_' + Math.random().toString(36).substring(2, 10);
  await set(ref(db, `generated_codes/active/staff/${code}`), true);
  alert(`Generated: ${code}`); 
  loadGeneratedCodes();
});

document.getElementById('gen-unblock-code-btn').addEventListener('click', async () => {
  const code = 'unblock_' + Math.random().toString(36).substring(2, 10);
  await set(ref(db, `generated_codes/active/unblock/${code}`), true);
  alert(`Generated: ${code}`); 
  loadGeneratedCodes();
});

// DM Blocking
dmBlockToggleBtn.addEventListener('click', async () => {
  if(!currentDMTarget) return;
  if(isCurrentDMBlocked) {
    await remove(ref(db, `user_dms_blocked/${currentActiveUser}/${currentDMTarget}`));
    isCurrentDMBlocked = false;
  } else {
    await set(ref(db, `user_dms_blocked/${currentActiveUser}/${currentDMTarget}`), true);
    isCurrentDMBlocked = true;
  }
  updateDMBlockBtnUI();
});

function updateDMBlockBtnUI() {
  dmBlockToggleBtn.textContent = isCurrentDMBlocked ? "Unblock User" : "Block User";
  dmBlockToggleBtn.className = isCurrentDMBlocked ? "secondary-btn" : "danger-btn";
}

function checkDMBlockStatus(targetUser) {
  onValue(ref(db, `user_dms_blocked/${currentActiveUser}/${targetUser}`), (snap) => {
    isCurrentDMBlocked = (snap.exists() && snap.val() === true);
    updateDMBlockBtnUI();
  });
}

// Global Message Actions
messagesContainer.addEventListener('click', async (e) => {
  if (e.target.classList.contains('message-author')) {
    const clickedUser = e.target.dataset.username;
    try {
      const snap = await get(child(dbRef, `users/${clickedUser}`));
      if(snap.exists()) {
        const data = snap.val();
        const disp = data.displayName ? ` (${data.displayName})` : '';
        alert(`User: @${clickedUser}${disp}\nAge: ${data.age || 'Not set'}\nBio: ${data.bio || 'No bio written.'}`);
      }
    } catch(err) { console.error(err); }
  }
  
  if (e.target.classList.contains('reply-btn')) {
    currentReplyContext = {
      username: e.target.dataset.username,
      displayName: e.target.dataset.displayname,
      text: e.target.dataset.text
    };
    replyToName.textContent = currentReplyContext.displayName || currentReplyContext.username;
    replyToText.textContent = currentReplyContext.text || "Attachment";
    replyBanner.classList.remove('hidden');
    messageInput.focus();
  }

  if (e.target.classList.contains('admin-block-btn')) {
    const targetUsername = e.target.dataset.username;
    if (targetUsername === 'thecoolwebsitemaker' && currentActiveUser !== 'thecoolwebsitemaker') {
      return alert("You cannot block the site owner.");
    }
    
    const targetSnap = await get(child(dbRef, `users/${targetUsername}`));
    if (currentActiveUser !== 'thecoolwebsitemaker' && targetSnap.exists() && targetSnap.val().isStaff) {
      return alert("Staff members cannot block other staff members.");
    }

    if (confirm(`Are you sure you want to block ${targetUsername} from the site?`)) {
      await set(ref(db, `blocked_users/${targetUsername}`), true);
    }
  }

  if (e.target.classList.contains('admin-revoke-btn')) {
    const targetUsername = e.target.dataset.username;
    if (targetUsername === 'thecoolwebsitemaker') return alert("You cannot revoke the owner's privileges.");
    if (confirm(`Revoke staff privileges from ${targetUsername}?`)) {
      await update(ref(db, `users/${targetUsername}`), { isStaff: false });
    }
  }
});

cancelReplyBtn.addEventListener('click', () => {
  currentReplyContext = null;
  replyBanner.classList.add('hidden');
});

// DM Search
dmSearchInput.addEventListener('input', async (e) => {
  const queryText = e.target.value.trim().toLowerCase();
  if (!queryText) { dmSearchResults.classList.add('hidden'); dmSearchResults.innerHTML = ''; return; }

  try {
    const snap = await get(child(dbRef, 'users'));
    if (!snap.exists()) return;
    
    dmSearchResults.innerHTML = '';
    let matches = 0;
    snap.forEach((userSnap) => {
      const uname = userSnap.key; const udata = userSnap.val();
      if (udata.wipedTo) return;
      if (uname !== currentActiveUser && (uname.includes(queryText) || (udata.displayName && udata.displayName.toLowerCase().includes(queryText)))) {
        matches++;
        const item = document.createElement('div');
        item.classList.add('dm-search-result-item');
        item.innerHTML = `<img src="${udata.pfp || DEFAULT_PFP}" class="dm-result-pfp"><span>@${uname}</span>`;
        item.addEventListener('click', () => { openDMChannel(uname); dmSearchInput.value = ''; dmSearchResults.classList.add('hidden'); });
        dmSearchResults.appendChild(item);
      }
    });
    if (matches > 0) dmSearchResults.classList.remove('hidden');
    else dmSearchResults.classList.add('hidden');
  } catch (err) { console.error(err); }
});

document.addEventListener('click', (e) => {
  if (!dmSearchInput.contains(e.target) && !dmSearchResults.contains(e.target)) dmSearchResults.classList.add('hidden');
});

function getDMKey(userA, userB) { return [userA, userB].sort().join('_'); }
async function openDMChannel(otherUser) {
  const dmId = getDMKey(currentActiveUser, otherUser);
  await set(ref(db, `user_dms/${currentActiveUser}/${dmId}`), otherUser);
  switchChannel(dmId, 'dm', otherUser);
}

function loadUserDMs() {
  onValue(ref(db, `user_dms/${currentActiveUser}`), (snapshot) => {
    dmChannelsList.innerHTML = '';
    if (!snapshot.exists()) return;
    snapshot.forEach((childSnap) => {
      const dmId = childSnap.key; const otherUser = childSnap.val();
      const dmEl = document.createElement('div');
      dmEl.classList.add('channel', 'dm-channel');
      if (currentChannel === dmId) dmEl.classList.add('active');
      dmEl.innerHTML = `<span>💬 @${otherUser}</span>`;
      dmEl.addEventListener('click', () => switchChannel(dmId, 'dm', otherUser));
      dmChannelsList.appendChild(dmEl);
    });
  });
}

// Staff Code Redemption
document.querySelectorAll('.channel[data-type="text"]').forEach(el => {
  el.addEventListener('click', async () => {
    const targetChannel = el.dataset.channel;
    if(targetChannel === currentChannel) return;

    if(targetChannel === 'staff' && !currentUserData.isStaff) {
      const code = prompt("Enter a staff code:");
      if(!code) return;
      try {
        const claimCheck = await get(child(dbRef, `generated_codes/active/staff/${code}`));
        if(!claimCheck.exists()) return alert("Invalid staff code.");
        
        const updates = {};
        updates[`generated_codes/active/staff/${code}`] = null;
        updates[`generated_codes/used/${code}`] = { usedBy: currentActiveUser, type: 'staff', usedAt: serverTimestamp() };
        updates[`users/${currentActiveUser}/isStaff`] = true;
        
        await update(ref(db), updates);
        alert("Access Granted! You are now Staff.");
      } catch(err) { 
        console.error(err);
        return alert("Error verifying staff code."); 
      }
    }
    switchChannel(targetChannel, 'text');
  });
});

// Unblock Code Redemption
document.getElementById('unblock-btn').addEventListener('click', async () => {
  const code = document.getElementById('unblock-code-input').value.trim();
  if (!code) return alert("Please enter an unblock code.");
  
  try {
    const claimCheck = await get(child(dbRef, `generated_codes/active/unblock/${code}`));
    if(!claimCheck.exists()) return alert("Invalid unblock code.");
    
    const updates = {};
    updates[`generated_codes/active/unblock/${code}`] = null;
    updates[`generated_codes/used/${code}`] = { usedBy: currentActiveUser, type: 'unblock', usedAt: serverTimestamp() };
    updates[`blocked_users/${currentActiveUser}`] = null;
    
    await update(ref(db), updates);
    
    document.getElementById('unblock-code-input').value = "";
    alert("Successfully unblocked! Welcome back.");
  } catch(err) { 
    console.error(err);
    return alert("Error verifying unblock code."); 
  }
});

function switchChannel(channelName, type, extraData = null) {
  currentChannel = channelName; currentChannelType = type;
  document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
  const activeEl = document.querySelector(`.channel[data-channel="${channelName}"]`) || Array.from(document.querySelectorAll('.dm-channel')).find(el => el.dataset.channel === channelName);
  if(activeEl) activeEl.classList.add('active');
  
  if (type === 'text') {
    document.getElementById('current-channel-title').textContent = channelName === 'main' ? "# main-chat" : "# staff-chat";
    dmBlockToggleBtn.classList.add('hidden');
    currentDMTarget = null;
  } else {
    document.getElementById('current-channel-title').textContent = `💬 DM with @${extraData}`;
    dmBlockToggleBtn.classList.remove('hidden');
    currentDMTarget = extraData;
    checkDMBlockStatus(extraData);
  }
  
  currentReplyContext = null;
  replyBanner.classList.add('hidden');
  
  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeTyping) unsubscribeTyping();
  
  loadMessages();
  listenToTyping();
}

// Typing Indicators
messageInput.addEventListener('input', () => {
  if (!currentActiveUser) return;
  const typingRefKey = currentChannelType === 'text' ? `typing_text/${currentChannel}` : `typing_dm/${currentChannel}`;
  set(ref(db, `${typingRefKey}/${currentActiveUser}`), true);
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    remove(ref(db, `${typingRefKey}/${currentActiveUser}`));
  }, 1000);
});

function listenToTyping() {
  const typingRefKey = currentChannelType === 'text' ? `typing_text/${currentChannel}` : `typing_dm/${currentChannel}`;
  unsubscribeTyping = onValue(ref(db, typingRefKey), (snapshot) => {
    const typers = [];
    snapshot.forEach((childSnap) => {
      if (childSnap.key !== currentActiveUser && childSnap.val() === true) typers.push(childSnap.key);
    });

    if (typers.length > 0) {
      typingIndicator.textContent = typers.join(', ') + (typers.length > 1 ? " are typing..." : " is typing...");
      typingIndicator.classList.remove('hidden');
    } else {
      typingIndicator.classList.add('hidden');
    }
  });
}

// File Attachments
fileUpload.addEventListener('change', async (e) => {
  chatError.classList.add('hidden');
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) {
    chatError.textContent = "File exceeds 5MB limit.";
    chatError.classList.remove('hidden');
    fileUpload.value = "";
    return;
  }
  try {
    const base64 = await fileToBase64(file);
    attachedFileData = { name: file.name, type: file.type, data: base64 };
    filePreviewName.textContent = file.name;
    filePreview.classList.remove('hidden');
  } catch (err) { console.error(err); }
});

document.getElementById('remove-file-btn').addEventListener('click', () => {
  attachedFileData = null;
  fileUpload.value = "";
  filePreview.classList.add('hidden');
});

// Sending Messages (Added 1,750 Character Limit Check)
messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (text === "" && !attachedFileData) return;
  
  if (text.length > 1750) {
    chatError.textContent = "Message exceeds the 1,750 character limit.";
    chatError.classList.remove('hidden');
    return;
  }

  // Rate Limiting
  const now = Date.now();
  if (now - lastMessageTime < 1000) {
    chatError.textContent = "Wait a second before sending another message!";
    chatError.classList.remove('hidden');
    return;
  }
  chatError.classList.add('hidden');
  lastMessageTime = now;

  // Mute Check
  if(currentUserData.mutedUntil && currentUserData.mutedUntil > Date.now()) {
    const minsLeft = Math.ceil((currentUserData.mutedUntil - Date.now()) / 60000);
    alert(`You are muted for ${minsLeft} more minutes.`);
    return;
  }

  // DM Block Check
  if(currentChannelType === 'dm') {
    const blockCheck = await get(child(dbRef, `user_dms_blocked/${currentDMTarget}/${currentActiveUser}`));
    if(blockCheck.exists() && blockCheck.val() === true) {
      alert("You cannot send messages to this user.");
      return;
    }
  }

  const payload = {
    text: text, username: currentActiveUser, displayName: currentUserData?.displayName || "",
    pfp: currentUserData?.pfp || DEFAULT_PFP, isStaff: currentUserData?.isStaff || false, createdAt: serverTimestamp()
  };

  if (attachedFileData) payload.file = attachedFileData;
  if (currentReplyContext) payload.replyTo = currentReplyContext;

  messageInput.value = '';
  attachedFileData = null;
  fileUpload.value = "";
  filePreview.classList.add('hidden');
  currentReplyContext = null;
  replyBanner.classList.add('hidden');

  const typingRefKey = currentChannelType === 'text' ? `typing_text/${currentChannel}` : `typing_dm/${currentChannel}`;
  remove(ref(db, `${typingRefKey}/${currentActiveUser}`));

  try { 
    if (currentChannelType === 'text') { 
      await push(ref(db, `messages_${currentChannel}`), payload); 
    } else {
      await push(ref(db, `messages_dm_${currentChannel}`), payload);
      const parts = currentChannel.split('_');
      const otherUser = parts[0] === currentActiveUser ? parts[1] : parts[0];
      await set(ref(db, `user_dms/${otherUser}/${currentChannel}`), currentActiveUser);
    }
  } catch (error) { console.error(error); }
});

// Load & Render Messages
function loadMessages() {
  const dbPath = currentChannelType === 'text' ? `messages_${currentChannel}` : `messages_dm_${currentChannel}`;
  let isFirstLoad = true;
  unsubscribeMessages = onValue(query(ref(db, dbPath), limitToLast(50)), (snapshot) => {
    messagesContainer.innerHTML = ''; 
    let latestMsg = null;
    snapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val(); latestMsg = data;
      const messageDiv = document.createElement('div');
      messageDiv.classList.add('message');
      
      let timeString = 'Just now';
      if (data.createdAt) {
        timeString = new Date(data.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      }

      let fileHtml = "";
      if (data.file) {
        if (data.file.type.startsWith("image/")) {
          fileHtml = `<div class="attachment-container"><img src="${data.file.data}"></div>`;
        } else if (data.file.type.startsWith("video/")) {
          fileHtml = `<div class="attachment-container"><video controls src="${data.file.data}"></video></div>`;
        } else if (data.file.type.startsWith("audio/")) {
          fileHtml = `<div class="attachment-container"><audio controls src="${data.file.data}"></audio></div>`;
        } else {
          fileHtml = `<div class="attachment-container"><a href="${data.file.data}" download="${data.file.name}" class="download-link">Download ${data.file.name}</a></div>`;
        }
      }

      let badges = (data.username === 'thecoolwebsitemaker') ? ' <span class="dev-badge" title="Web Developer">💻</span>' : '';
      if (data.isStaff) badges += ' <span class="staff-badge" title="Staff">🛡️</span>';

      const visibleName = data.displayName || data.username;

      let replyHtml = "";
      if (data.replyTo) {
        const repliedName = data.replyTo.displayName || data.replyTo.username;
        replyHtml = `
          <div class="replied-message-block">
            <span class="replied-author">Replying to ${repliedName}:</span> 
            <span class="replied-text">${data.replyTo.text || "Attachment"}</span>
          </div>
        `;
      }

      let blockBtnHtml = "";
      if (currentUserData.isStaff && !data.isStaff && data.username !== currentActiveUser) {
        blockBtnHtml = `<button class="admin-block-btn danger-btn" data-username="${data.username}" style="padding: 2px 6px; font-size: 11px;">Block</button>`;
      }

      let revokeStaffBtnHtml = "";
      const canRevoke = (currentActiveUser === 'thecoolwebsitemaker');
      if (canRevoke && data.isStaff && data.username !== currentActiveUser && data.username !== 'thecoolwebsitemaker') {
        revokeStaffBtnHtml = `<button class="admin-revoke-btn danger-btn" data-username="${data.username}" style="padding: 2px 6px; font-size: 11px; background-color: #f59e0b;">Revoke</button>`;
      }

      const safeText = data.text ? data.text.replace(/"/g, '&quot;') : '';
      const safeDisp = data.displayName ? data.displayName.replace(/"/g, '&quot;') : '';

      messageDiv.innerHTML = `
        <img src="${data.pfp || DEFAULT_PFP}" class="msg-pfp" alt="PFP">
        <div class="msg-content">
          <div class="message-header">
            <span class="message-author" data-username="${data.username}">${visibleName}</span>${badges}
            <span class="message-time">${timeString}</span>
            <div class="message-actions">
              <button class="reply-btn" data-username="${data.username}" data-displayname="${safeDisp}" data-text="${safeText}">Reply</button>
              ${blockBtnHtml}
              ${revokeStaffBtnHtml}
            </div>
          </div>
          ${replyHtml}
          <div class="message-text">${data.text}</div>
          ${fileHtml}
        </div>
      `;
      messagesContainer.appendChild(messageDiv);
    });

    if (!isFirstLoad && latestMsg && latestMsg.username !== currentActiveUser) {
      const isReplyToMe = latestMsg.replyTo && latestMsg.replyTo.username === currentActiveUser;
      if (currentChannelType === 'dm' || isReplyToMe) {
        showDesktopNotification(currentChannelType === 'dm' ? `New DM from @${latestMsg.username}` : `New reply from @${latestMsg.username}`, latestMsg.text || "sent an attachment");
      }
    }
    isFirstLoad = false;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}
