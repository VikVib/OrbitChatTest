/* --------- IMPORTANT: Replace firebaseConfig below with YOUR Firebase project's config ---------
  Get it from Firebase Console -> Project settings -> Your apps -> SDK setup and config
-------------------------------------------------------------------------------------------- */
const firebaseConfig = {
  // paste your config here, e.g.
  // apiKey: "...",
  // authDomain: "...",
  // databaseURL: "https://<your-db>.firebaseio.com",
  // projectId: "...",
  // storageBucket: "...",
  // messagingSenderId: "...",
  // appId: "..."
};

if(!firebaseConfig || !firebaseConfig.apiKey){
  document.body.innerHTML = '<div style="padding:20px;color:white;background:#111">Paste your Firebase config object into <code>app.js</code> (see README).</div>';
  throw new Error('Firebase config missing');
}

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/* Basic data model:
  /servers/{serverId}/channels/{channelId} -> {name, created}
  /messages/{serverId}/{channelId}/{pushId} -> {username, text, ts}
  /presence/{serverId}/{uid} -> {username, ts}
*/

const $ = id => document.getElementById(id);

const serversListEl = $('servers-list');
const serverInput = $('server-id-input');
const btnJoin = $('btn-join-server');
const btnCreate = $('btn-create-server');
const btnAddServer = $('btn-add-server');
const serverNameEl = $('server-name');
const channelsListEl = $('channels-list');
const btnAddChannel = $('btn-add-channel');

const nameInput = $('name-input');
const btnSetName = $('btn-set-name');
const presenceListEl = $('presence-list');

const channelTitleEl = $('channel-title');
const messagesEl = $('messages');
const msgForm = $('msg-form');
const msgInput = $('msg-input');

let currentServer = null;
let currentChannel = null;
let username = localStorage.getItem('cc_username') || ('User' + Math.floor(Math.random()*1000));
nameInput.value = username;

// helper: sanitize simple
function esc(s){ return String(s || '').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function addServerButton(id){
  const d = document.createElement('div');
  d.className = 'server-btn';
  d.title = id;
  d.textContent = (id[0] || '#').toUpperCase();
  d.onclick = () => { serverInput.value = id; joinServer(id); };
  serversListEl.appendChild(d);
}

// load locally saved servers
const savedServers = JSON.parse(localStorage.getItem('cc_saved_servers') || '[]');
savedServers.forEach(addServerButton);

// UI actions
btnAddServer.onclick = () => {
  const sid = prompt('New server id (short, no spaces):','my-server');
  if(!sid) return;
  const arr = JSON.parse(localStorage.getItem('cc_saved_servers') || '[]');
  if(!arr.includes(sid)){ arr.push(sid); localStorage.setItem('cc_saved_servers', JSON.stringify(arr)); addServerButton(sid); }
};

btnCreate.onclick = () => {
  const sid = serverInput.value.trim() || 'general';
  db.ref('servers/' + sid).set({created: Date.now()});
  alert('Server created: ' + sid);
  joinServer(sid);
};

btnJoin.onclick = () => {
  const sid = serverInput.value.trim() || 'general';
  joinServer(sid);
};

btnAddChannel.onclick = () => {
  if(!currentServer) return alert('Join a server first');
  const name = prompt('Channel name (no #):','general');
  if(!name) return;
  const cid = name.replace(/\s+/g,'-').toLowerCase();
  db.ref(`servers/${currentServer}/channels/${cid}`).set({name, created: Date.now()});
};

// presence: add current user
function announcePresence(server){
  if(!server) return;
  const uid = localStorage.getItem('cc_uid') || ('uid_' + Math.random().toString(36).slice(2,8));
  localStorage.setItem('cc_uid', uid);
  db.ref(`presence/${server}/${uid}`).set({username, ts: Date.now()});
  db.ref(`presence/${server}/${uid}`).onDisconnect().remove();
}

// join server
function joinServer(sid){
  if(currentServer === sid) return;
  leaveServer(currentServer);
  currentServer = sid;
  serverNameEl.textContent = sid;
  // show as saved quick server
  if(!savedServers.includes(sid)){
    savedServers.push(sid);
    localStorage.setItem('cc_saved_servers', JSON.stringify(savedServers));
    addServerButton(sid);
  }
  // load channels
  db.ref(`servers/${sid}/channels`).on('value', snap => {
    const v = snap.val() || {};
    channelsListEl.innerHTML = '';
    const keys = Object.keys(v);
    if(keys.length === 0){
      // create default channel
      db.ref(`servers/${sid}/channels/general`).set({name:'general', created: Date.now()});
      return;
    }
    keys.forEach(k => {
      const li = document.createElement('li');
      li.textContent = v[k].name || k;
      li.dataset.cid = k;
      li.onclick = () => { switchChannel(k); };
      if(k === currentChannel) li.classList.add('active');
      channelsListEl.appendChild(li);
    });
    // if no channel selected, pick first
    if(!currentChannel && keys[0]) switchChannel(keys[0]);
  });

  // presence listen
  db.ref(`presence/${sid}`).on('value', snap => {
    const v = snap.val() || {};
    const names = Object.values(v).map(x => x.username);
    presenceListEl.innerHTML = '<strong>Users</strong><br>' + names.map(n => `<div>${esc(n)}</div>`).join('');
  });

  announcePresence(sid);
}

// leave server
function leaveServer(sid){
  if(!sid) return;
  db.ref(`servers/${sid}/channels`).off();
  db.ref(`presence/${sid}`).off();
  db.ref(`messages/${sid}`).off();
  messagesEl.innerHTML = '';
  presenceListEl.innerHTML = '';
  currentChannel = null;
}

// switch channel
function switchChannel(cid){
  if(!currentServer) return;
  currentChannel = cid;
  channelTitleEl.textContent = `#${cid}`;
  // highlight active
  Array.from(channelsListEl.children).forEach(li => li.classList.toggle('active', li.dataset.cid === cid));
  // listen messages
  db.ref(`messages/${currentServer}/${cid}`).off();
  messagesEl.innerHTML = '';
  const q = db.ref(`messages/${currentServer}/${cid}`).limitToLast(200);
  q.on('child_added', snap => {
    const m = snap.val();
    renderMessage(m);
  });
}

// basic render
function renderMessage(m){
  const d = document.createElement('div'); d.className = 'msg';
  const meta = document.createElement('div'); meta.className = 'meta';
  meta.innerHTML = `${esc(m.username)} • ${new Date(m.ts).toLocaleTimeString()}`;
  const text = document.createElement('div'); text.className = 'text'; text.textContent = m.text;
  d.appendChild(meta); d.appendChild(text);
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// set name
btnSetName.onclick = () => {
  username = (nameInput.value || ('User' + Math.floor(Math.random()*1000))).trim();
  localStorage.setItem('cc_username', username);
  announcePresence(currentServer);
  alert('Name set to ' + username);
};

// send message
msgForm.addEventListener('submit', e => {
  e.preventDefault();
  if(!currentServer || !currentChannel) return alert('Join a server and channel first');
  const txt = msgInput.value.trim();
  if(!txt) return;
  const msg = {username, text: txt, ts: Date.now()};
  db.ref(`messages/${currentServer}/${currentChannel}`).push(msg);
  msgInput.value = '';
});

// try auto-join default 'general' if nothing else
if(!currentServer){
  serverInput.value = 'general';
  // do NOT auto-announce presence until join button clicked to avoid accidental presence
}
