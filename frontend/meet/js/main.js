const serverAddress = window.location.hostname;
const route = window.location.pathname;

let roomID = 'Main-Room';
const routeParts = window.location.pathname.split('/').filter(p => p);
if (routeParts.length > 0) {
    if (routeParts.includes('meet')) {
        const meetIndex = routeParts.indexOf('meet');
        if (routeParts.length > meetIndex + 1) {
            roomID = routeParts[meetIndex + 1];
        }
    } else {
        roomID = routeParts[routeParts.length - 1];
    }
}
roomID = roomID.toUpperCase();

const myUsername = localStorage.getItem('username') || 'User';
const myInitial = myUsername.charAt(0).toUpperCase();

const localCameraAvatar = document.getElementById('local-camera-avatar');
if (localCameraAvatar) localCameraAvatar.innerText = myInitial;

const socket = io(`http://${serverAddress}:8000`, {
    autoConnect: false,
    query: { room: roomID }
});

const btnCreateGroups = document.getElementById('btn-create-groups');
const btnReturnAll = document.getElementById('btn-return-all');
const teacherControls = document.getElementById('teacher-controls');
const spanRoomName = document.getElementById('room-name');

const role = localStorage.getItem('role');
if (role === 'Tutor') {
    if (teacherControls) teacherControls.classList.remove('hidden');
}
const localVideo = document.getElementById('local-video');
const gridVideos = document.getElementById('grid-videos');

const btnScreen = document.getElementById('btn-screen');
const btnWhiteboard = document.getElementById('btn-whiteboard');
const btnChatToggle = document.getElementById('btn-chat-toggle');
const sidePanel = document.getElementById('side-panel');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');
const whiteboardContainer = document.getElementById('whiteboard-container');
const whiteboardCanvas = document.getElementById('whiteboard-canvas');

let localStream;
let screenStream;
let isCameraOn = true;
const peers = {};

let audioContext = null;
let localAnalyser = null;
const remoteAnalysers = {};

const configWebRTC = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

async function startCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } },
            audio: true
        });
        localVideo.srcObject = localStream;
        socket.connect();

        setupLocalAudioAnalysis();
    } catch (error) {
        console.error("Error accessing camera:", error);
        alert("Could not access camera or microphone.");
    }
}

function setupLocalAudioAnalysis() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(localStream);
        localAnalyser = audioContext.createAnalyser();
        localAnalyser.fftSize = 256;
        source.connect(localAnalyser);

        monitorSpeaking('local', localAnalyser);
    } catch (e) {
        console.error('Audio analysis setup failed:', e);
    }
}

function monitorSpeaking(userId, analyser) {
    const dataArray = new Uint8Array(analyser.fftSize);
    const speakingEl = document.getElementById(`${userId}-speaking`);
    const containerEl = document.getElementById(`${userId === 'local' ? 'local-container' : `container-${userId}`}`);

    function check() {
        if (!analyser) return;

        // Handle Muted State
        let isMuted = false;
        if (userId === 'local') {
            const audioTrack = localStream ? localStream.getAudioTracks()[0] : null;
            isMuted = audioTrack ? !audioTrack.enabled : true;
        } else {
            // For remote users, we rely on a class or state. 
            // Better: Check if the track is actually providing data or if we have a 'muted' flag.
            // I'll use a data attribute or a class on the container to track remote mute state.
            isMuted = containerEl.classList.contains('remote-muted');
        }

        if (speakingEl) {
            if (isMuted) {
                speakingEl.classList.add('is-muted');
                speakingEl.classList.remove('is-talking');
            } else {
                speakingEl.classList.remove('is-muted');

                analyser.getByteTimeDomainData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const val = (dataArray[i] - 128) / 128;
                    sum += val * val;
                }
                const rms = Math.sqrt(sum / dataArray.length);
                const isSpeaking = rms > 0.02;

                if (isSpeaking) {
                    speakingEl.classList.add('is-talking');
                    if (containerEl) containerEl.classList.add('is-speaking');
                } else {
                    speakingEl.classList.remove('is-talking');
                    if (containerEl) containerEl.classList.remove('is-speaking');
                }
            }
        }

        requestAnimationFrame(check);
    }
    check();
}

function createPeerConnection(userId) {
    const peerConnection = new RTCPeerConnection(configWebRTC);
    peers[userId] = peerConnection;

    const tracksToShare = screenStream ? screenStream.getTracks() : localStream.getTracks();
    tracksToShare.forEach(track => {
        peerConnection.addTrack(track, screenStream ? screenStream : localStream);
    });

    peerConnection.ontrack = (event) => {
        createVideoContainer(userId);
        const videoElement = document.getElementById(`video-${userId}`);
        if (videoElement) {
            videoElement.srcObject = event.streams[0];
        }

        // Setup remote audio analysis
        if (event.track.kind === 'audio' && audioContext) {
            try {
                const remoteSource = audioContext.createMediaStreamSource(event.streams[0]);
                const remoteAnalyser = audioContext.createAnalyser();
                remoteAnalyser.fftSize = 256;
                remoteSource.connect(remoteAnalyser);
                remoteAnalysers[userId] = remoteAnalyser;
                monitorSpeaking(userId, remoteAnalyser);
            } catch (e) {
                console.error('Remote audio analysis failed:', e);
            }
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice_candidate', { recipient: userId, candidate: event.candidate });
        }
    };

    return peerConnection;
}

function createVideoContainer(userId) {
    if (document.getElementById(`container-${userId}`)) return;
    const div = document.createElement('div');
    div.className = 'video-container';
    div.id = `container-${userId}`;

    const video = document.createElement('video');
    video.id = `video-${userId}`;
    video.autoplay = true;
    video.playsinline = true;

    const cameraOff = document.createElement('div');
    cameraOff.className = 'camera-off-overlay hidden';
    cameraOff.id = `${userId}-camera-off`;
    const avatar = document.createElement('div');
    avatar.className = 'camera-off-avatar';
    avatar.innerText = userId.substring(0, 1).toUpperCase();
    cameraOff.appendChild(avatar);

    const speaking = document.createElement('div');
    speaking.className = 'speaking-indicator';
    speaking.id = `${userId}-speaking`;
    speaking.innerHTML = '<span></span><span></span><span></span><i class="ph ph-microphone-slash muted-icon"></i>';

    const name = document.createElement('p');
    name.className = 'user-name';
    name.innerText = `ID: ${userId.substring(0, 4)}`;

    div.appendChild(video);
    div.appendChild(cameraOff);
    div.appendChild(speaking);
    div.appendChild(name);
    gridVideos.appendChild(div);
}

function destroyVideoContainer(userId) {
    const div = document.getElementById(`container-${userId}`);
    if (div) div.remove();
    if (peers[userId]) {
        peers[userId].close();
        delete peers[userId];
    }
    delete remoteAnalysers[userId];
}

socket.on('connect', () => console.log(`Connected to server, ID: ${socket.id}`));
socket.on('new_peer', async (data) => {
    createVideoContainer(data.userId);
    const peerConnection = createPeerConnection(data.userId);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('webrtc_offer', { recipient: data.userId, offer: offer });
});

socket.on('webrtc_offer', async (data) => {
    createVideoContainer(data.sender);
    const peerConnection = createPeerConnection(data.sender);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('webrtc_answer', { recipient: data.sender, answer: answer });
});

socket.on('webrtc_answer', async (data) => {
    const peerConnection = peers[data.sender];
    if (peerConnection) {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (e) { console.error(e); }
    }
});

socket.on('ice_candidate', async (data) => {
    const peerConnection = peers[data.sender];
    if (peerConnection) {
        try { await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) { }
    }
});

socket.on('peer_left', (data) => destroyVideoContainer(data.userId));
socket.on('peer_list', (ids) => ids.forEach(id => createVideoContainer(id)));

socket.on('toggle_audio', (data) => {
    const container = document.getElementById(`container-${data.userId}`);
    if (container) {
        if (data.enabled) {
            container.classList.remove('remote-muted');
        } else {
            container.classList.add('remote-muted');
        }
    }
});

socket.on('room_change', (data) => {
    spanRoomName.innerText = data.roomName;
    if (data.roomName !== roomID) {
        document.body.classList.add('breakout-mode');
        btnReturnAll.classList.remove('hidden');
        btnCreateGroups.classList.add('hidden');

        if (data.duration) {
            startBreakoutTimer(data.duration);
        }
    } else {
        document.body.classList.remove('breakout-mode');
        btnReturnAll.classList.add('hidden');
        btnCreateGroups.classList.remove('hidden');
        stopBreakoutTimer();
    }
    const containers = document.querySelectorAll('.video-container');
    containers.forEach(c => { if (!c.querySelector('#local-video')) c.remove(); });
    for (let id in peers) {
        peers[id].close();
        delete peers[id];
    }
});

let breakoutTimerInterval = null;
function startBreakoutTimer(minutes) {
    const display = document.getElementById('breakout-timer-display');
    const countdown = document.getElementById('timer-countdown');
    if (!display || !countdown) return;

    display.classList.remove('hidden');
    let seconds = minutes * 60;

    clearInterval(breakoutTimerInterval);
    breakoutTimerInterval = setInterval(() => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        countdown.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        if (seconds <= 0) {
            clearInterval(breakoutTimerInterval);
            if (role === 'Tutor' && spanRoomName.innerText !== roomID) {
                socket.emit('end_breakout');
            }
        }
        seconds--;
    }, 1000);
}

function stopBreakoutTimer() {
    clearInterval(breakoutTimerInterval);
    const display = document.getElementById('breakout-timer-display');
    if (display) display.classList.add('hidden');
}

btnCreateGroups.addEventListener('click', () => {
    document.getElementById('modal-breakout-config').classList.remove('hidden');
});

document.getElementById('btn-start-breakout').addEventListener('click', () => {
    const size = parseInt(document.getElementById('group-size').value) || 4;
    const duration = parseInt(document.getElementById('breakout-duration').value) || 15;

    socket.emit('request_breakout', { groupSize: size, duration: duration });
    document.getElementById('modal-breakout-config').classList.add('hidden');
});

btnReturnAll.addEventListener('click', () => {
    socket.emit('end_breakout');
});

const btnMute = document.getElementById('btn-mute');
const btnCamera = document.getElementById('btn-camera');

btnMute.addEventListener('click', () => {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (track) {
        track.enabled = !track.enabled;
        btnMute.innerHTML = track.enabled ? '<i class="ph ph-microphone"></i>' : '<i class="ph ph-microphone-slash"></i>';
        btnMute.classList.toggle("off", !track.enabled);

        socket.emit('toggle_audio', { enabled: track.enabled });
    }
});

btnCamera.addEventListener('click', () => {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (track) {
        track.enabled = !track.enabled;
        isCameraOn = track.enabled;
        btnCamera.innerHTML = track.enabled ? '<i class="ph ph-video-camera"></i>' : '<i class="ph ph-video-camera-slash"></i>';
        btnCamera.classList.toggle("off", !track.enabled);

        const localCameraOff = document.getElementById('local-camera-off');
        if (localCameraOff) {
            if (track.enabled) {
                localCameraOff.classList.add('hidden');
            } else {
                localCameraOff.classList.remove('hidden');
            }
        }
    }
});

btnScreen.addEventListener('click', async () => {
    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
        localVideo.srcObject = localStream;
        localVideo.classList.add('mirror');
        btnScreen.classList.remove('active');
        const videoTrack = localStream.getVideoTracks()[0];
        for (let id in peers) {
            const sender = peers[id].getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(videoTrack);
        }
    } else {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            localVideo.srcObject = screenStream;
            localVideo.classList.remove('mirror');
            btnScreen.classList.add('active');

            const screenTrack = screenStream.getVideoTracks()[0];
            screenTrack.onended = () => { btnScreen.click(); };

            for (let id in peers) {
                const sender = peers[id].getSenders().find(s => s.track.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
            }
        } catch (e) {
            console.error("Screen sharing cancelled", e);
        }
    }
});

btnChatToggle.addEventListener('click', () => {
    sidePanel.classList.toggle('open');
    btnChatToggle.classList.toggle('active');
    document.querySelector('.main-content').classList.toggle('chat-open');
});

function sendMessage() {
    const msg = chatInput.value.trim();
    if (msg) {
        socket.emit('send_message', { text: msg });
        addChatMessage('Me', msg, true);
        chatInput.value = '';
    }
}
btnSendChat.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

socket.on('new_message', (data) => {
    addChatMessage(`User ${data.sender.substring(0, 4)}`, data.text, false);
    if (!sidePanel.classList.contains('open')) {
        btnChatToggle.classList.add('active');
    }
});

function addChatMessage(sender, text, isMe) {
    const div = document.createElement('div');
    div.className = `chat-msg ${isMe ? 'me' : ''}`;
    div.innerHTML = `<div class="sender">${sender}</div><div class="text">${text}</div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

let isDrawing = false;
const ctx = whiteboardCanvas.getContext('2d');
ctx.strokeStyle = '#000000';
ctx.lineWidth = 2;

function resizeCanvas() {
    whiteboardCanvas.width = whiteboardContainer.clientWidth;
    whiteboardCanvas.height = whiteboardContainer.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

btnWhiteboard.addEventListener('click', () => {
    whiteboardContainer.classList.toggle('hidden');
    btnWhiteboard.classList.toggle('active');
    if (!whiteboardContainer.classList.contains('hidden')) {
        resizeCanvas();
    }
});

whiteboardCanvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const rect = whiteboardCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    socket.emit('draw_whiteboard', { event: 'start', x: x / whiteboardCanvas.width, y: y / whiteboardCanvas.height });
});

whiteboardCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const rect = whiteboardCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
    socket.emit('draw_whiteboard', { event: 'draw', x: x / whiteboardCanvas.width, y: y / whiteboardCanvas.height });
});

whiteboardCanvas.addEventListener('mouseup', () => {
    isDrawing = false;
    socket.emit('draw_whiteboard', { event: 'end' });
});

whiteboardCanvas.addEventListener('mouseleave', () => { isDrawing = false; });

socket.on('draw_whiteboard', (data) => {
    const x = data.x * whiteboardCanvas.width;
    const y = data.y * whiteboardCanvas.height;

    if (data.event === 'start') {
        ctx.beginPath();
        ctx.moveTo(x, y);
    } else if (data.event === 'draw') {
        ctx.lineTo(x, y);
        ctx.stroke();
    }
});

async function validateMeeting() {
    const username = localStorage.getItem('username');
    const loadingOverlay = document.getElementById('loading-overlay');
    const invalidOverlay = document.getElementById('invalid-meeting-overlay');

    if (!username) {
        window.location.href = '/';
        return;
    }

    if (roomID === 'MAIN-ROOM') {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        startCamera();
        return;
    }

    try {
        const res = await fetch(`/api/classes/meetings/validate/${roomID}`, {
            credentials: 'include'
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Invalid meeting');
        }

        const meeting = await res.json();
        if (spanRoomName) spanRoomName.innerText = meeting.name;

        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        startCamera();
    } catch (err) {
        console.error('Meeting validation failed:', err);
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        if (invalidOverlay) {
            invalidOverlay.classList.remove('hidden');
            const errorMsg = invalidOverlay.querySelector('p');
            if (errorMsg && err.message !== 'Invalid meeting') {
                errorMsg.innerText = err.message;
            }
        }
    }
}

validateMeeting();
