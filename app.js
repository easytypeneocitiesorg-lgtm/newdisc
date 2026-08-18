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

let unsubscribeMessages = null;
let currentActiveUser = null;
let currentUserData = {};
let currentChannel = "main";
let currentChannelType = "text"; 
let currentDMTarget = null;
let isCurrentDMBlocked = false;
let adminTargetUser = null;
let announceTimeout = null;

if ("Notification" in window && Notification.permission !== "granted") Notification.requestPermission();
function showDesktopNotification(title, body) {
  if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, icon: currentUserData.pfp || DEFAULT_PFP });
}

async function logUserIn(username) {
  currentActiveUser = username;
  onValue(ref(db, `blocked_users/${username}`), (snap) => {
    if (snap.exists() && snap.val() === true) {
      authScreen.classList.add('hidden'); chatScreen.classList.add('hidden'); blockedScreen.classList.remove('hidden');
    } else {
      blockedScreen.classList.add('hidden');
      if (currentActiveUser) { authScreen.classList.add('hidden'); chatScreen.classList.remove('hidden'); }
    }
  });

  // Verify Account Integrity (for wipes)
  onValue(ref(db, `users/${username}`), (snap) => {
    if(!snap.exists() && currentActiveUser === username) {
      alert("Your account state has changed or been wiped. Please log in again.");
      document.getElementById('logout-btn').click();
    } else {
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
  let badges = (username === 'thecoolwebsitemaker') ? ' <span class="dev-badge">💻</span>' : '';
  if (currentUserData.isStaff) badges += ' <span class="staff-badge">🛡️</span>';
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

document.getElementById('login-btn').addEventListener('click', async (e) => {
  e.preventDefault();
  authError.textContent = 'Checking...';
  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  if (!username || !password) return (authError.textContent = "Enter both fields.");

  try {
    const snap = await get(child(dbRef, `users/${username}`));
    if (snap.exists() && snap.val().password === password) {
      localStorage.setItem('obh_session', username); authError.textContent = ''; logUserIn(username);
    } else { authError.textContent = "Incorrect username or password."; }
  } catch (error) { authError.textContent = "Database error."; }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('obh_session');
  currentActiveUser = null; currentUserData = {};
  authScreen.classList.remove('hidden'); chatScreen.classList.add('hidden'); blockedScreen.classList.add('hidden');
  if (unsubscribeMessages) unsubscribeMessages();
});

// Admin Panel Logic
openAdminBtn.addEventListener('click', async () => {
  adminModal.classList.remove('hidden');
  const staffSelect = document.getElementById('staff-roster-select');
  staffSelect.innerHTML = '<option value="">-- View Current Staff --</option>';
  const snap = await get(child(dbRef, 'users'));
  snap.forEach(user => {
    if(user.val().isStaff) staffSelect.innerHTML += `<option value="${user.key}">@${user.key} ${user.val().displayName ? `(${user.val().displayName})` : ''}</option>`;
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
  if(snap.exists()) {
    adminTargetUser = search;
    document.getElementById('target-user-display').textContent = `Target: @${search}`;
    document.getElementById('admin-user-actions').classList.remove('hidden');
  } else {
    alert("User not found.");
    document.getElementById('admin-user-actions').classList.add('hidden');
  }
});

document.getElementById('admin-mute-btn').addEventListener('click', async () => {
  const mins = parseInt(document.getElementById('mute-duration').value);
  if(!adminTargetUser || isNaN(mins)) return;
  await update(ref(db, `users/${adminTargetUser}`), { mutedUntil: Date.now() + (mins * 60000) });
  alert(`@${adminTargetUser} muted for ${mins} minutes.`);
});

document.getElementById('admin-wipe-btn').addEventListener('click', async () => {
  if(!adminTargetUser) return;
  if(!confirm(`Are you sure you want to wipe @${adminTargetUser}?`)) return;
  
  const rand = Math.random().toString(36).substring(2, 8);
  const newUname = 'user_' + rand;
  const oldData = (await get(child(dbRef, `users/${adminTargetUser}`))).val();
  
  await set(ref(db, `users/${newUname}`), { ...oldData, displayName: "", bio: "", pfp: DEFAULT_PFP, isStaff: false });
  await remove(ref(db, `users/${adminTargetUser}`));
  alert(`Account wiped. New username: ${newUname}`);
  document.getElementById('admin-user-actions').classList.add('hidden');
});

document.getElementById('admin-block-btn').addEventListener('click', async () => {
  if(!adminTargetUser) return;
  await set(ref(db, `blocked_users/${adminTargetUser}`), true);
  alert(`@${adminTargetUser} blocked from the site.`);
});

document.getElementById('admin-revoke-btn').addEventListener('click', async () => {
  if(!adminTargetUser || currentActiveUser !== 'thecoolwebsitemaker') return;
  await update(ref(db, `users/${adminTargetUser}`), { isStaff: false });
  alert(`Staff privileges revoked from @${adminTargetUser}.`);
});

// Owner Tools
async function loadGeneratedCodes() {
  const codesSelect = document.getElementById('generated-codes-select');
  codesSelect.innerHTML = '<option value="">-- View Generated Codes --</option>';
  
  const staffSnap = await get(child(dbRef, 'generated_codes/staff'));
  if(staffSnap.exists()) {
    staffSnap.forEach(c => codesSelect.innerHTML += `<option>[STAFF] ${c.key} - Used by: ${c.val().usedBy || 'UNUSED'}</option>`);
  }
  const unblockSnap = await get(child(dbRef, 'generated_codes/unblock'));
  if(unblockSnap.exists()) {
    unblockSnap.forEach(c => codesSelect.innerHTML += `<option>[UNBLOCK] ${c.key} - Used by: ${c.val().usedBy || 'UNUSED'}</option>`);
  }
}

document.getElementById('gen-staff-code-btn').addEventListener('click', async () => {
  const code = 'staffaccess_' + Math.random().toString(36).substring(2, 10);
  await set(ref(db, `generated_codes/staff/${code}`), { usedBy: null });
  alert(`Generated: ${code}`); loadGeneratedCodes();
});

document.getElementById('gen-unblock-code-btn').addEventListener('click', async () => {
  const code = 'unblock_' + Math.random().toString(36).substring(2, 10);
  await set(ref(db, `generated_codes/unblock/${code}`), { usedBy: null });
  alert(`Generated: ${code}`); loadGeneratedCodes();
});

// DM Blocking (For everyone)
dmBlockToggleBtn.addEventListener('click', async () => {
  if(!currentDMTarget) return;
  if(isCurrentDMBlocked) {
    await remove(ref(db, `user_dms_blocked/${currentActiveUser}/${currentDMTarget}`));
    dmBlockToggleBtn.textContent = "Block User";
    dmBlockToggleBtn.classList.remove('secondary-btn');
    dmBlockToggleBtn.classList.add('danger-btn');
    isCurrentDMBlocked = false;
  } else {
    await set(ref(db, `user_dms_blocked/${currentActiveUser}/${currentDMTarget}`), true);
    dmBlockToggleBtn.textContent = "Unblock User";
    dmBlockToggleBtn.classList.remove('danger-btn');
    dmBlockToggleBtn.classList.add('secondary-btn');
    isCurrentDMBlocked = true;
  }
});

function checkDMBlockStatus(targetUser) {
  onValue(ref(db, `user_dms_blocked/${currentActiveUser}/${targetUser}`), (snap) => {
    isCurrentDMBlocked = (snap.exists() && snap.val() === true);
    dmBlockToggleBtn.textContent = isCurrentDMBlocked ? "Unblock User" : "Block User";
    dmBlockToggleBtn.className = isCurrentDMBlocked ? "secondary-btn" : "danger-btn";
  });
}

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

// Channel Switching & Code Redemptions
document.querySelectorAll('.channel[data-type="text"]').forEach(el => {
  el.addEventListener('click', async () => {
    const targetChannel = el.dataset.channel;
    if(targetChannel === currentChannel) return;

    if(targetChannel === 'staff' && !currentUserData.isStaff) {
      const code = prompt("Enter a staff code:");
      if(!code) return;
      try {
        const claimCheck = await get(child(dbRef, `generated_codes/staff/${code}`));
        if(!claimCheck.exists()) return alert("Invalid code.");
        if(claimCheck.val().usedBy) return alert("Code already used!");
        
        await update(ref(db, `generated_codes/staff/${code}`), { usedBy: currentActiveUser });
        await update(ref(db, `users/${currentActiveUser}`), { isStaff: true });
        alert("Access Granted! You are now Staff.");
      } catch(err) { return alert("Error verifying code."); }
    }
    switchChannel(targetChannel, 'text');
  });
});

document.getElementById('unblock-btn').addEventListener('click', async () => {
  const code = document.getElementById('unblock-code-input').value.trim();
  if (!code) return;
  try {
    const claimCheck = await get(child(dbRef, `generated_codes/unblock/${code}`));
    if(!claimCheck.exists()) return alert("Invalid unblock code.");
    if(claimCheck.val().usedBy) return alert("Code already used!");
    
    await update(ref(db, `generated_codes/unblock/${code}`), { usedBy: currentActiveUser });
    await remove(ref(db, `blocked_users/${currentActiveUser}`));
    alert("Successfully unblocked! Welcome back.");
  } catch(err) { return alert("Error verifying code."); }
});

function switchChannel(channelName, type, extraData = null) {
  currentChannel = channelName; currentChannelType = type;
  document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
  
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
  
  if (unsubscribeMessages) unsubscribeMessages();
  loadMessages();
}

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  
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

  messageInput.value = '';
  try { 
    if (currentChannelType === 'text') { await push(ref(db, `messages_${currentChannel}`), payload); } 
    else {
      await push(ref(db, `messages_dm_${currentChannel}`), payload);
      const parts = currentChannel.split('_');
      const otherUser = parts[0] === currentActiveUser ? parts[1] : parts[0];
      await set(ref(db, `user_dms/${otherUser}/${currentChannel}`), currentActiveUser);
    }
  } catch (error) { console.error(error); }
});

function loadMessages() {
  const dbPath = currentChannelType === 'text' ? `messages_${currentChannel}` : `messages_dm_${currentChannel}`;
  let isFirstLoad = true;
  unsubscribeMessages = onValue(query(ref(db, dbPath), limitToLast(50)), (snapshot) => {
    messagesContainer.innerHTML = ''; 
    let latestMsg = null;
    snapshot.forEach((childSnap) => {
      const data = childSnap.val(); latestMsg = data;
      const messageDiv = document.createElement('div');
      messageDiv.classList.add('message');
      
      let badges = (data.username === 'thecoolwebsitemaker') ? ' <span class="dev-badge">💻</span>' : '';
      if (data.isStaff) badges += ' <span class="staff-badge">🛡️</span>';

      messageDiv.innerHTML = `
        <img src="${data.pfp || DEFAULT_PFP}" class="msg-pfp">
        <div class="msg-content">
          <div class="message-header">
            <span class="message-author">${data.displayName || data.username}</span>${badges}
          </div>
          <div class="message-text">${data.text}</div>
        </div>
      `;
      messagesContainer.appendChild(messageDiv);
    });

    if (!isFirstLoad && latestMsg && latestMsg.username !== currentActiveUser) {
      showDesktopNotification(currentChannelType === 'dm' ? `New DM from @${latestMsg.username}` : `New message in ${currentChannel}`, latestMsg.text);
    }
    isFirstLoad = false;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}
