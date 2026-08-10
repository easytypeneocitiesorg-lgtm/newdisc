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
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// DOM Elements
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

// Unblock Elements
const unblockCodeInput = document.getElementById('unblock-code-input');
const unblockBtn = document.getElementById('unblock-btn');

// Global Event Elements
const cheddarOverlay = document.getElementById('cheddar-overlay');
const cheddarAudio = document.getElementById('cheddar-audio');
let cheddarTimeout;

// Signup Specific
const loginFields = document.getElementById('login-fields');
const ageGroup = document.getElementById('age-group');
const ageSelect = document.getElementById('age-select');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');

// Profile & Reply UI
const profileModal = document.getElementById('profile-modal');
const editProfileBtn = document.getElementById('edit-profile-btn');
const saveProfileBtn = document.getElementById('save-profile-btn');
const cancelProfileBtn = document.getElementById('cancel-profile-btn');
const displayNameInput = document.getElementById('display-name-input');
const bioInput = document.getElementById('bio-input');
const replyBanner = document.getElementById('reply-banner');
const replyToName = document.getElementById('reply-to-name');
const replyToText = document.getElementById('reply-to-text');
const cancelReplyBtn = document.getElementById('cancel-reply-btn');

let unsubscribeMessages = null;
let unsubscribeTyping = null;
let unsubscribeBlockStatus = null;
let currentActiveUser = null;
let currentUserData = {};
let lastMessageTime = 0;
let attachedFileData = null;
let currentChannel = "main";
let typingTimeout = null;
let currentReplyContext = null;

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = (error) => reject(error);
});

function updateUIAfterLogin(username) {
  currentPfpImg.src = currentUserData.pfp || DEFAULT_PFP;
  const displayName = currentUserData.displayName || username;
  
  let badges = '';
  if (username === 'thecoolwebsitemaker') {
    badges += ' <span class="dev-badge" title="Web Developer">💻</span>';
  }
  if (currentUserData.isStaff) {
    badges += ' <span class="staff-badge" title="Staff">🛡️</span>';
  }
  
  currentUserSpan.innerHTML = displayName + badges;
}

function listenToBlockStatus(username) {
  if (unsubscribeBlockStatus) unsubscribeBlockStatus();
  unsubscribeBlockStatus = onValue(ref(db, `blocked_users/${username}`), (snapshot) => {
    if (snapshot.exists() && snapshot.val() === true) {
      authScreen.classList.add('hidden');
      chatScreen.classList.add('hidden');
      blockedScreen.classList.remove('hidden');
    } else {
      blockedScreen.classList.add('hidden');
      if (currentActiveUser) {
        authScreen.classList.add('hidden');
        chatScreen.classList.remove('hidden');
      }
    }
  });
}

async function logUserIn(username) {
  currentActiveUser = username;
  listenToBlockStatus(username);
  
  try {
    const snap = await get(child(dbRef, `users/${username}`));
    if(snap.exists()){
      currentUserData = snap.val();
      if(!currentUserData.pfp) currentUserData.pfp = DEFAULT_PFP;
    }
    updateUIAfterLogin(username);
  } catch(e) { console.error(e); }
  
  switchChannel('main');
}

const savedSession = localStorage.getItem('obh_session');
if (savedSession) logUserIn(savedSession);

loginBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  authError.textContent = 'Checking...';
  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  if (!username || !password) return (authError.textContent = "Enter both fields.");

  try {
    const snapshot = await get(child(dbRef, `users/${username}`));
    if (snapshot.exists() && snapshot.val().password === password) {
      localStorage.setItem('obh_session', username);
      authError.textContent = '';
      logUserIn(username);
    } else {
      authError.textContent = "Incorrect username or password.";
    }
  } catch (error) { authError.textContent = "Database error."; }
});

signupBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (ageGroup.classList.contains('hidden')) {
    if (username.length < 3 || password.length < 4) {
      authError.textContent = "Username > 3 chars, Password > 4 chars.";
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
    const age = ageSelect.value;
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
  currentActiveUser = null;
  currentUserData = {};
  authScreen.classList.remove('hidden');
  chatScreen.classList.add('hidden');
  blockedScreen.classList.add('hidden');
  
  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeTyping) unsubscribeTyping();
  if (unsubscribeBlockStatus) {
    unsubscribeBlockStatus();
    unsubscribeBlockStatus = null;
  }
});

// Profile Editing
editProfileBtn.addEventListener('click', () => {
  displayNameInput.value = currentUserData?.displayName || "";
  bioInput.value = currentUserData?.bio || "";
  profileModal.classList.remove('hidden');
});

cancelProfileBtn.addEventListener('click', () => {
  profileModal.classList.add('hidden');
});

saveProfileBtn.addEventListener('click', async () => {
  const newDisplayName = displayNameInput.value.trim();
  const newBio = bioInput.value.trim();

  try {
    await update(ref(db, `users/${currentActiveUser}`), { 
      displayName: newDisplayName, 
      bio: newBio 
    });
    currentUserData.displayName = newDisplayName;
    currentUserData.bio = newBio;
    updateUIAfterLogin(currentActiveUser);
    profileModal.classList.add('hidden');
  } catch(err) {
    alert("Failed to save profile.");
  }
});

document.getElementById('pfp-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !currentActiveUser) return;
  if (file.size > MAX_FILE_SIZE) return alert("PFP must be under 5MB.");
  
  try {
    const base64 = await fileToBase64(file);
    await update(ref(db, `users/${currentActiveUser}`), { pfp: base64 });
    currentUserData.pfp = base64;
    currentPfpImg.src = base64;
  } catch (err) { console.error(err); }
});

// Unblock Submission
unblockBtn.addEventListener('click', async () => {
  const code = unblockCodeInput.value.trim();
  if (!code) return alert("Please enter an unblock code.");

  try {
    const res = await fetch('unblockcodes.txt');
    if(!res.ok) throw new Error("Could not load codes file.");
    const text = await res.text();
    const validCodes = text.split('\n').map(c => c.trim()).filter(c => c !== "");

    if(validCodes.includes(code)) {
      const claimCheck = await get(child(dbRef, `used_unblock_codes/${code}`));
      if(claimCheck.exists()) return alert("This unblock code has already been used!");
      
      await set(ref(db, `used_unblock_codes/${code}`), currentActiveUser);
      await remove(ref(db, `blocked_users/${currentActiveUser}`));
      
      alert("Successfully unblocked! Welcome back.");
      unblockCodeInput.value = "";
    } else {
      return alert("Invalid unblock code.");
    }
  } catch(err) { 
    return alert("Error verifying code."); 
  }
});

// Keydown listener for the global screen event
document.addEventListener('keydown', async (e) => {
  if (e.key === '=' && currentActiveUser) {
    if (currentActiveUser !== "thecoolwebsitemaker") {
      alert("You are not authorized to use secret codes.");
      return;
    }
    
    const code = prompt("Enter secret code:");
    if (code === "cheddarandbbqwavy") {
      try {
        await set(ref(db, 'global_events/cheddar'), { time: Date.now() });
      } catch(err) {
        console.error("Database error while triggering event.", err);
      }
    } else if (code) {
      alert("Invalid code.");
    }
  }
});

// Listener for the global event broadcast
onValue(ref(db, 'global_events/cheddar'), (snapshot) => {
  if (snapshot.exists()) {
    const data = snapshot.val();
    const now = Date.now();
    const timeDiff = now - data.time;
    
    if (timeDiff < 30000) {
      const remainingTime = 30000 - timeDiff;
      
      cheddarOverlay.classList.remove('hidden');
      cheddarAudio.currentTime = 0;
      cheddarAudio.loop = true;
      cheddarAudio.play().catch(e => console.warn("Audio autoplay blocked.", e));
      
      clearTimeout(cheddarTimeout);
      cheddarTimeout = setTimeout(() => {
        cheddarOverlay.classList.add('hidden');
        cheddarAudio.pause();
        cheddarAudio.currentTime = 0;
      }, remainingTime);
    }
  }
});

// Delegate Clicks for Usernames, Replies, Blocks, & Revoking Staff
messagesContainer.addEventListener('click', async (e) => {
  if (e.target.classList.contains('message-author')) {
    const clickedUser = e.target.dataset.username;
    try {
      const snap = await get(child(dbRef, `users/${clickedUser}`));
      if(snap.exists()) {
        const data = snap.val();
        const disp = data.displayName ? ` (${data.displayName})` : '';
        const age = data.age || 'Not set';
        const bio = data.bio || 'No bio written.';
        
        alert(`User: @${clickedUser}${disp}\nAge: ${age}\nBio: ${bio}`);
      } else {
        alert(`User @${clickedUser} could not be found.`);
      }
    } catch(err) { console.error(err); }
  }
  
  if (e.target.classList.contains('reply-btn')) {
    const rUsername = e.target.dataset.username;
    const rDisplay = e.target.dataset.displayname;
    const rText = e.target.dataset.text;
    
    currentReplyContext = {
      username: rUsername,
      displayName: rDisplay,
      text: rText
    };
    
    replyToName.textContent = rDisplay || rUsername;
    replyToText.textContent = rText || "Attachment";
    replyBanner.classList.remove('hidden');
    messageInput.focus();
  }

  if (e.target.classList.contains('block-btn')) {
    const targetUsername = e.target.dataset.username;
    const confirmBlock = confirm(`Are you sure you want to block ${targetUsername} from the site?`);
    if (confirmBlock) {
      try {
        await set(ref(db, `blocked_users/${targetUsername}`), true);
        alert(`${targetUsername} has been blocked.`);
      } catch (err) {
        console.error("Error blocking user:", err);
      }
    }
  }

  if (e.target.classList.contains('revoke-staff-btn')) {
    const targetUsername = e.target.dataset.username;
    const confirmRevoke = confirm(`Are you sure you want to revoke staff privileges from ${targetUsername}?`);
    if (confirmRevoke) {
      try {
        const usedCodesSnap = await get(child(dbRef, 'used_codes'));
        if (usedCodesSnap.exists()) {
          usedCodesSnap.forEach((childSnap) => {
            if (childSnap.val() === targetUsername) {
              remove(ref(db, `used_codes/${childSnap.key}`));
            }
          });
        }
        
        await update(ref(db, `users/${targetUsername}`), { isStaff: false });
        
        if (currentActiveUser === targetUsername) {
          currentUserData.isStaff = false;
          updateUIAfterLogin(currentActiveUser);
          if (currentChannel === 'staff') {
            switchChannel('main');
          }
        }
        
        alert(`Staff privileges have been revoked from ${targetUsername}.`);
      } catch (err) {
        console.error("Error revoking staff:", err);
        alert("Failed to revoke staff privileges.");
      }
    }
  }
});

cancelReplyBtn.addEventListener('click', () => {
  currentReplyContext = null;
  replyBanner.classList.add('hidden');
});

// Channels & Code Logic
document.querySelectorAll('.channel').forEach(el => {
  el.addEventListener('click', async () => {
    const targetChannel = el.dataset.channel;
    if(targetChannel === currentChannel) return;

    if(targetChannel === 'staff' && !currentUserData.isStaff) {
      const code = prompt("Enter an admin code to unlock Staff Chat:");
      if(!code) return;

      try {
        const res = await fetch('codes.txt');
        if(!res.ok) throw new Error("Could not load codes file.");
        const text = await res.text();
        const validCodes = text.split('\n').map(c => c.trim()).filter(c => c !== "");

        if(validCodes.includes(code)) {
          const claimCheck = await get(child(dbRef, `used_codes/${code}`));
          if(claimCheck.exists()) return alert("This code has already been used!");
          
          await set(ref(db, `used_codes/${code}`), currentActiveUser);
          await update(ref(db, `users/${currentActiveUser}`), { isStaff: true });
          currentUserData.isStaff = true;
          updateUIAfterLogin(currentActiveUser);
          alert("Access Granted! You are now Staff.");
        } else {
          return alert("Invalid code.");
        }
      } catch(err) { return alert("Error verifying code."); }
    }
    switchChannel(targetChannel);
  });
});

function switchChannel(channelName) {
  currentChannel = channelName;
  document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
  document.querySelector(`.channel[data-channel="${channelName}"]`).classList.add('active');
  document.getElementById('current-channel-title').textContent = channelName === 'main' ? "# main-chat" : "# staff-chat";
  
  currentReplyContext = null;
  replyBanner.classList.add('hidden');
  
  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeTyping) unsubscribeTyping();
  
  loadMessages();
  listenToTyping();
}

messageInput.addEventListener('input', () => {
  if (!currentActiveUser) return;
  set(ref(db, `typing/${currentChannel}/${currentActiveUser}`), true);
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    remove(ref(db, `typing/${currentChannel}/${currentActiveUser}`));
  }, 1000);
});

function listenToTyping() {
  unsubscribeTyping = onValue(ref(db, `typing/${currentChannel}`), (snapshot) => {
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

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (text === "" && !attachedFileData) return;
  
  const now = Date.now();
  if (now - lastMessageTime < 1000) {
    chatError.textContent = "Wait a second before sending another message!";
    chatError.classList.remove('hidden');
    return;
  }
  
  chatError.classList.add('hidden');
  lastMessageTime = now;

  const payload = {
    text: text,
    username: currentActiveUser,
    displayName: currentUserData?.displayName || "",
    pfp: currentUserData?.pfp || DEFAULT_PFP,
    isStaff: currentUserData?.isStaff || false,
    createdAt: serverTimestamp()
  };

  if (attachedFileData) payload.file = attachedFileData;
  if (currentReplyContext) payload.replyTo = currentReplyContext;

  messageInput.value = '';
  attachedFileData = null;
  fileUpload.value = "";
  filePreview.classList.add('hidden');
  currentReplyContext = null;
  replyBanner.classList.add('hidden');
  
  remove(ref(db, `typing/${currentChannel}/${currentActiveUser}`));

  try { await push(ref(db, `messages_${currentChannel}`), payload); } 
  catch (error) { console.error(error); }
});

function loadMessages() {
  // Limited to the last 50 messages to save download bandwidth
  const messagesRef = query(ref(db, `messages_${currentChannel}`), limitToLast(50));
  
  unsubscribeMessages = onValue(messagesRef, (snapshot) => {
    messagesContainer.innerHTML = ''; 
    
    snapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val();
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
      
      let badges = '';
      if (data.username === 'thecoolwebsitemaker') {
        badges += ' <span class="dev-badge" title="Web Developer">💻</span>';
      }
      if (data.isStaff) {
        badges += ' <span class="staff-badge" title="Staff Member">🛡️</span>';
      }

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
        blockBtnHtml = `<button class="block-btn" data-username="${data.username}" style="background-color: red; color: white; border: none; border-radius: 4px; cursor: pointer; padding: 2px 6px; font-size: 11px; margin-left: 5px;">Block from site</button>`;
      }

      let revokeStaffBtnHtml = "";
      const canRevoke = (currentActiveUser === 'thecoolwebsitemaker' || currentActiveUser === 'spookso');
      if (canRevoke && data.isStaff && data.username !== currentActiveUser && data.username !== 'thecoolwebsitemaker' && data.username !== 'spookso') {
        revokeStaffBtnHtml = `<button class="revoke-staff-btn" data-username="${data.username}" style="background-color: #ff8800; color: white; border: none; border-radius: 4px; cursor: pointer; padding: 2px 6px; font-size: 11px; margin-left: 5px;">Revoke Staff</button>`;
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
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}
