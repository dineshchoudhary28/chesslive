// front/public/js/chess-app.js

// Chess game variables
let gameHasStarted = false;
let gameOver = false;
let opponentName = '';
let board = null;
let game = new Chess();

// WebRTC variables
let localStream;
let remoteStream;
let peerConnection;
let isVideoEnabled = true;
let isAudioEnabled = true;

// DOM elements
const $status = $('#status');
const $pgn = $('#pgn');
const $opponentName = $('#opponentName');
const $localVideo = document.getElementById('localVideo');
const $remoteVideo = document.getElementById('remoteVideo');
const $toggleVideo = $('#toggleVideo');
const $toggleAudio = $('#toggleAudio');
const $chatMessages = $('#chatMessages');
const $chatInput = $('#chatInput');
const $sendMessage = $('#sendMessage');

// ----- CHESS GAME LOGIC -----

function onDragStart(source, piece, position, orientation) {
    // Do not pick up pieces if the game is over
    if (game.game_over()) return false;
    if (!gameHasStarted) return false;
    if (gameOver) return false;

    // Only pick up your own pieces
    if ((playerColor === 'black' && piece.search(/^w/) !== -1) || 
        (playerColor === 'white' && piece.search(/^b/) !== -1)) {
        return false;
    }

    // Only pick up pieces for the side to move
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) || 
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }
}

function onDrop(source, target) {
    // Try the move
    let theMove = {
        from: source,
        to: target,
        promotion: 'q' // Always promote to queen for simplicity
    };
    
    // Check if the move is legal
    var move = game.move(theMove);

    // Illegal move
    if (move === null) return 'snapback';

    // Send move to opponent
    socket.emit('move', theMove);
    
    updateStatus();
}

function onSnapEnd() {
    // Update the board position after piece snap
    board.position(game.fen());
}

function updateStatus() {
    let status = '';
    let moveColor = game.turn() === 'b' ? 'Black' : 'White';

    // Checkmate
    if (game.in_checkmate()) {
        status = 'Game over, ' + moveColor + ' is in checkmate.';
    }
    // Draw
    else if (game.in_draw()) {
        status = 'Game over, drawn position';
    }
    // Opponent disconnected
    else if (gameOver) {
        status = 'Opponent disconnected, you win!';
    }
    // Waiting for opponent
    else if (!gameHasStarted) {
        status = 'Waiting for opponent to join...';
    }
    // Game continues
    else {
        status = moveColor + ' to move';
        // Check
        if (game.in_check()) {
            status += ', ' + moveColor + ' is in check';
        }
    }

    $status.html(status);
    $pgn.html(game.pgn());
}

// Initialize the board
function initializeBoard() {
    const config = {
        draggable: true,
        position: 'start',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd,
        pieceTheme: '/public/img/chesspieces/wikipedia/{piece}.png'
    };
    
    board = Chessboard('myBoard', config);
    
    // Flip board for black player
    if (playerColor === 'black') {
        board.flip();
    }
    
    updateStatus();
}

// ----- WEBRTC VIDEO CALL LOGIC -----

// Initialize WebRTC
async function initializeWebRTC() {
    try {
        // Get local media stream
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        
        // Display local video
        $localVideo.srcObject = localStream;
        
        // Create peer connection with STUN servers
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        };
        
        peerConnection = new RTCPeerConnection(configuration);
        
        // Add local tracks to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Handle incoming tracks (remote video)
        peerConnection.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                $remoteVideo.srcObject = event.streams[0];
                remoteStream = event.streams[0];
            }
        };
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('iceCandidate', {
                    candidate: event.candidate
                });
            }
        };
        
        // Create offer if white player (initiator)
        if (playerColor === 'white' && gameHasStarted) {
            createOffer();
        }
        
    } catch (error) {
        console.error('Error accessing media devices:', error);
        // Fallback message in the UI
        $localVideo.parentElement.innerHTML = '<div class="alert alert-danger">Camera/microphone access denied or not available</div>';
    }
}

// Create and send WebRTC offer
async function createOffer() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('offer', {
            offer: peerConnection.localDescription
        });
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

// Handle incoming WebRTC offer
async function handleOffer(offer) {
    if (!peerConnection) return;
    
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('answer', {
            answer: peerConnection.localDescription
        });
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

// Handle incoming WebRTC answer
async function handleAnswer(answer) {
    if (!peerConnection) return;
    
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error('Error handling answer:', error);
    }
}

// Handle ICE candidate
async function handleIceCandidate(iceCandidate) {
    if (!peerConnection) return;
    
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidate));
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
}

// Toggle video on/off
function toggleVideo() {
    isVideoEnabled = !isVideoEnabled;
    
    localStream.getVideoTracks().forEach(track => {
        track.enabled = isVideoEnabled;
    });
    
    $toggleVideo.text(isVideoEnabled ? 'Turn Off Video' : 'Turn On Video');
}

// Toggle audio on/off
function toggleAudio() {
    isAudioEnabled = !isAudioEnabled;
    
    localStream.getAudioTracks().forEach(track => {
        track.enabled = isAudioEnabled;
    });
    
    $toggleAudio.text(isAudioEnabled ? 'Mute Audio' : 'Unmute Audio');
}

// ----- CHAT FUNCTIONALITY -----

// Send chat message
function sendChatMessage() {
    const message = $chatInput.val().trim();
    if (!message) return;
    
    // Send message to server
    socket.emit('chatMessage', message);
    
    // Clear input
    $chatInput.val('');
    $chatInput.focus();
}

// Add message to chat display
function addChatMessage(message) {
    const isSelf = message.sender === username;
    const messageHtml = `
        <div class="chat-message ${isSelf ? 'chat-message-self' : 'chat-message-other'}">
            ${!isSelf ? `<div class="chat-sender">${message.sender}</div>` : ''}
            ${message.text}
            <span class="chat-time">${message.time}</span>
        </div>
    `;
    
    $chatMessages.append(messageHtml);
    $chatMessages.scrollTop($chatMessages[0].scrollHeight);
}

// ----- EVENT HANDLERS -----

// Initialize everything when document is ready
$(document).ready(function() {
    // Initialize board
    initializeBoard();
    
    // Join game with code from URL
    if (gameCode) {
        socket.emit('joinGame', {
            code: gameCode,
            username: username
        });
    }
    
    // Video call controls
    $toggleVideo.on('click', toggleVideo);
    $toggleAudio.on('click', toggleAudio);
    
    // Chat controls
    $sendMessage.on('click', sendChatMessage);
    $chatInput.on('keypress', function(e) {
        if (e.which === 13) { // Enter key
            sendChatMessage();
        }
    });
    
    // Socket event handlers
    socket.on('startGame', function(data) {
        gameHasStarted = true;
        opponentName = data.opponent;
        $opponentName.text('Opponent: ' + opponentName);
        
        // Initialize WebRTC after both players joined
        initializeWebRTC();
        
        updateStatus();
    });
    
    socket.on('waitingForOpponent', function() {
        $status.html('Waiting for opponent to join. Share your game code!');
    });
    
    socket.on('newMove', function(move) {
        game.move(move);
        board.position(game.fen());
        updateStatus();
    });
    
    socket.on('gameOverDisconnect', function(data) {
        gameOver = true;
        updateStatus();
        addChatMessage({
            sender: 'System',
            text: `${data.username || 'Opponent'} disconnected from the game.`,
            time: new Date().toLocaleTimeString()
        });
    });
    
    // WebRTC signaling
    socket.on('offer', function(data) {
        handleOffer(data.offer);
    });
    
    socket.on('answer', function(data) {
        handleAnswer(data.answer);
    });
    
    socket.on('iceCandidate', function(data) {
        handleIceCandidate(data.candidate);
    });
    
    // Chat messages
    socket.on('newMessage', function(message) {
        addChatMessage(message);
    });
});