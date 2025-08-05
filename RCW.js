// DOM Elements
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('color-picker');
const sizeSlider = document.getElementById('size-slider');
const clearButton = document.getElementById('clear-button');
const penTool = document.getElementById('pen-tool');
const eraserTool = document.getElementById('eraser-tool');
const roomIdInput = document.getElementById('room-id');
const connectButton = document.getElementById('connect-button');
const copyButton = document.getElementById('copy-button');
const userList = document.getElementById('user-list');

// Canvas setup
canvas.width = window.innerWidth * 0.7;
canvas.height = window.innerHeight * 0.8;

// Drawing state
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentTool = 'pen';
let connections = [];
let peers = {};

// Initialize Peer
const peer = new Peer({
    debug: 3,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
        ]
    }
});

// Peer event handlers
peer.on('open', (id) => {
    console.log('My peer ID is: ' + id);
    roomIdInput.placeholder = id;
});

peer.on('connection', (conn) => {
    setupConnection(conn);
});

peer.on('error', (err) => {
    console.error('Peer error:', err);
});

// Connection setup
function setupConnection(conn) {
    connections.push(conn);
    peers[conn.peer] = conn;
    
    // Add user to list
    const userElement = document.createElement('div');
    userElement.className = 'user';
    userElement.textContent = conn.peer;
    userElement.id = `user-${conn.peer}`;
    userList.appendChild(userElement);
    
    conn.on('data', (data) => {
        handleIncomingData(data);
    });
    
    conn.on('close', () => {
        removePeer(conn.peer);
    });
    
    conn.on('error', (err) => {
        console.error('Connection error:', err);
        removePeer(conn.peer);
    });
    
    // Send current canvas state to new peer
    sendCanvasState(conn);
}

function removePeer(peerId) {
    delete peers[peerId];
    const userElement = document.getElementById(`user-${peerId}`);
    if (userElement) {
        userElement.remove();
    }
    connections = connections.filter(conn => conn.peer !== peerId);
}

// Drawing functions
function startDrawing(x, y, color, size) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    isDrawing = true;
    lastX = x;
    lastY = y;
}

function draw(x, y) {
    if (!isDrawing) return;
    
    ctx.lineTo(x, y);
    ctx.stroke();
    lastX = x;
    lastY = y;
}

function stopDrawing() {
    if (!isDrawing) return;
    ctx.closePath();
    isDrawing = false;
}

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Event listeners for drawing
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const color = currentTool === 'eraser' ? '#FFFFFF' : colorPicker.value;
    const size = sizeSlider.value;
    
    startDrawing(x, y, color, size);
    broadcast({
        type: 'draw',
        action: 'start',
        x, y, color, size
    });
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (isDrawing) {
        draw(x, y);
        broadcast({
            type: 'draw',
            action: 'move',
            x, y
        });
    }
});

canvas.addEventListener('mouseup', () => {
    stopDrawing();
    broadcast({
        type: 'draw',
        action: 'stop'
    });
});

canvas.addEventListener('mouseout', () => {
    stopDrawing();
});

// Touch support
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    const color = currentTool === 'eraser' ? '#FFFFFF' : colorPicker.value;
    const size = sizeSlider.value;
    
    startDrawing(x, y, color, size);
    broadcast({
        type: 'draw',
        action: 'start',
        x, y, color, size
    });
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    if (isDrawing) {
        draw(x, y);
        broadcast({
            type: 'draw',
            action: 'move',
            x, y
        });
    }
});

canvas.addEventListener('touchend', () => {
    stopDrawing();
    broadcast({
        type: 'draw',
        action: 'stop'
    });
});

// Tool controls
penTool.addEventListener('click', () => {
    currentTool = 'pen';
    penTool.classList.add('active');
    eraserTool.classList.remove('active');
});

eraserTool.addEventListener('click', () => {
    currentTool = 'eraser';
    eraserTool.classList.add('active');
    penTool.classList.remove('active');
});

clearButton.addEventListener('click', () => {
    clearCanvas();
    broadcast({
        type: 'clear'
    });
});

// Connection controls
connectButton.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim();
    if (roomId && roomId !== peer.id) {
        const conn = peer.connect(roomId);
        setupConnection(conn);
        roomIdInput.value = '';
    }
});

copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(peer.id)
        .then(() => {
            const originalText = copyButton.innerHTML;
            copyButton.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => {
                copyButton.innerHTML = originalText;
            }, 2000);
        })
        .catch(err => {
            console.error('Could not copy text: ', err);
        });
});

// Data handling
function broadcast(data) {
    connections.forEach(conn => {
        try {
            conn.send(data);
        } catch (err) {
            console.error('Error sending data:', err);
            removePeer(conn.peer);
        }
    });
}

function handleIncomingData(data) {
    switch (data.type) {
        case 'draw':
            handleDrawingData(data);
            break;
        case 'clear':
            clearCanvas();
            break;
        case 'canvasState':
            loadCanvasState(data);
            break;
    }
}

function handleDrawingData(data) {
    switch (data.action) {
        case 'start':
            startDrawing(data.x, data.y, data.color, data.size);
            break;
        case 'move':
            draw(data.x, data.y);
            break;
        case 'stop':
            stopDrawing();
            break;
    }
}

function sendCanvasState(conn) {
    const imageData = canvas.toDataURL('image/png');
    conn.send({
        type: 'canvasState',
        imageData
    });
}

function loadCanvasState(data) {
    const img = new Image();
    img.onload = () => {
        ctx.drawImage(img, 0, 0);
    };
    img.src = data.imageData;
}

// Window resize handling
window.addEventListener('resize', () => {
    const oldImage = canvas.toDataURL('image/png');
    
    canvas.width = window.innerWidth * 0.7;
    canvas.height = window.innerHeight * 0.8;
    
    const img = new Image();
    img.onload = () => {
        ctx.drawImage(img, 0, 0);
    };
    img.src = oldImage;
});
