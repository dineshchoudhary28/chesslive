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
let isInitiator = false;

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
    
    // Check if game is over after this move
    if (game.game_over()) {
        handleGameOver();
    }
}

function onSnapEnd() {
    // Update the board position after piece snap
    board.position(game.fen());
}

function handleGameOver() {
    gameOver = true;
    let winner = null;
    let reason = '';
    let winnerName = '';
    
    if (game.in_checkmate()) {
        // Determine winner
        const loser = game.turn(); // Current turn is the one who got checkmated
        winner = loser === 'w' ? 'black' : 'white';
        reason = 'checkmate';
        
        if (winner === playerColor) {
            winnerName = username;
        } else {
            winnerName = opponentName;
        }
    } else if (game.in_draw()) {
        winner = 'draw';
        reason = 'draw';
    }
    
    // Send game over event to server
    socket.emit('gameOver', {
        winner: winner,
        reason: reason,
        winnerName: winnerName
    });
}

function showGameOverModal(winner, reason, winnerName) {
    let title = '';
    let message = '';
    let isWinner = false;
    
    if (winner === 'draw') {
        title = 'Game Draw!';
        message = 'The game ended in a draw.';
    } else if (winner === playerColor) {
        title = 'Congratulations!';
        message = 'You won the game!';
        isWinner = true;
    } else {
        title = 'Better Luck Next Time!';
        message = `${winnerName} won the game.`;
    }
    
    if (reason === 'checkmate') {
        message += ' Game ended by checkmate.';
    }
    
    // Create modal HTML
    const modalHtml = `
        <div class="modal fade show" id="gameOverModal" tabindex="-1" style="display: block; background-color: rgba(0,0,0,0.5);">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header ${isWinner ? 'bg-success text-white' : 'bg-warning'}">
                        <h4 class="modal-title">${title}</h4>
                    </div>
                    <div class="modal-body text-center">
                        <h5>${message}</h5>
                        <div class="mt-3">
                            <button id="backToLobby" class="btn btn-primary btn-lg">Back to Lobby</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    $('#gameOverModal').remove();
    
    // Add modal to body
    $('body').append(modalHtml);
    
    // Handle back to lobby button
    $('#backToLobby').on('click', function() {
        window.location.href = '/lobby';
    });
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
        console.log('Initializing WebRTC for player:', playerColor);
        
        // Determine if this player initiates the call
        isInitiator = (playerColor === 'white');
        
        // Get local media stream with specific constraints
        const constraints = {
            video: {
                width: { ideal: 320 },
                height: { ideal: 240 },
                frameRate: { ideal: 15 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            }
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Display local video
        $localVideo.srcObject = localStream;
        
        // Create peer connection with STUN servers
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };
        
        peerConnection = new RTCPeerConnection(configuration);
        
        // Add local tracks to peer connection
        localStream.getTracks().forEach(track => {
            console.log('Adding track:', track.kind);
            peerConnection.addTrack(track, localStream);
        });
        
        // Handle incoming tracks (remote video)
        peerConnection.ontrack = (event) => {
            console.log('Received remote track:', event.track.kind);
            if (event.streams && event.streams[0]) {
                console.log('Setting remote video stream');
                $remoteVideo.srcObject = event.streams[0];
                remoteStream = event.streams[0];
            }
        };
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Sending ICE candidate');
                socket.emit('iceCandidate', {
                    candidate: event.candidate
                });
            }
        };
        
        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
        };
        
        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);
        };
        
        // Small delay before creating offer to ensure both peers are ready
        if (isInitiator) {
            setTimeout(() => {
                console.log('Creating offer as initiator');
                createOffer();
            }, 1000);
        }
        
    } catch (error) {
        console.error('Error accessing media devices:', error);
        // Show user-friendly error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-warning';
        errorDiv.innerHTML = 'Camera/microphone access denied or not available. Video chat will be disabled.';
        $localVideo.parentElement.appendChild(errorDiv);
    }
}

// Create and send WebRTC offer
async function createOffer() {
    if (!peerConnection) {
        console.error('No peer connection available');
        return;
    }
    
    try {
        console.log('Creating WebRTC offer');
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        
        await peerConnection.setLocalDescription(offer);
        console.log('Sending offer to opponent');
        
        socket.emit('webrtc-offer', {
            offer: peerConnection.localDescription,
            from: playerColor
        });
        
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

// Handle incoming WebRTC offer
async function handleOffer(data) {
    if (!peerConnection) {
        console.error('No peer connection available for handling offer');
        return;
    }
    
    try {
        console.log('Handling WebRTC offer from:', data.from);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        console.log('Sending answer to opponent');
        socket.emit('webrtc-answer', {
            answer: peerConnection.localDescription,
            from: playerColor
        });
        
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

// Handle incoming WebRTC answer
async function handleAnswer(data) {
    if (!peerConnection) {
        console.error('No peer connection available for handling answer');
        return;
    }
    
    try {
        console.log('Handling WebRTC answer from:', data.from);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } catch (error) {
        console.error('Error handling answer:', error);
    }
}

// Handle ICE candidate
async function handleIceCandidate(data) {
    if (!peerConnection) {
        console.error('No peer connection available for ICE candidate');
        return;
    }
    
    try {
        console.log('Adding ICE candidate');
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
}

// Toggle video on/off
function toggleVideo() {
    if (!localStream) return;
    
    isVideoEnabled = !isVideoEnabled;
    
    localStream.getVideoTracks().forEach(track => {
        track.enabled = isVideoEnabled;
    });
    
    $toggleVideo.text(isVideoEnabled ? 'Turn Off Video' : 'Turn On Video');
    $toggleVideo.removeClass(isVideoEnabled ? 'btn-success' : 'btn-secondary');
    $toggleVideo.addClass(isVideoEnabled ? 'btn-secondary' : 'btn-success');
}

// Toggle audio on/off
function toggleAudio() {
    if (!localStream) return;
    
    isAudioEnabled = !isAudioEnabled;
    
    localStream.getAudioTracks().forEach(track => {
        track.enabled = isAudioEnabled;
    });
    
    $toggleAudio.text(isAudioEnabled ? 'Mute Audio' : 'Unmute Audio');
    $toggleAudio.removeClass(isAudioEnabled ? 'btn-secondary' : 'btn-danger');
    $toggleAudio.addClass(isAudioEnabled ? 'btn-danger' : 'btn-secondary');
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
    const timestamp = formatMessageTime(message.time);
    
    let messageHtml;
    if (message.sender === 'System') {
        messageHtml = `
            <div class="chat-message system-message">
                <div class="chat-text">${sanitizeMessage(message.text)}</div>
                <span class="chat-time">${timestamp}</span>
            </div>
        `;
    } else {
        messageHtml = `
            <div class="chat-message ${isSelf ? 'chat-message-self' : 'chat-message-other'}">
                ${!isSelf ? `<div class="chat-sender">${sanitizeMessage(message.sender)}</div>` : ''}
                <div class="chat-text">${sanitizeMessage(message.text)}</div>
                <span class="chat-time">${timestamp}</span>
            </div>
        `;
    }
    
    $chatMessages.append(messageHtml);
    $chatMessages.scrollTop($chatMessages[0].scrollHeight);
}

// Format message time
function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    try {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
}

// Sanitize message content
function sanitizeMessage(text) {
    if (!text) return '';
    return $('<div>').text(text).html();
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
            e.preventDefault();
        }
    });
    
    // Socket event handlers
    socket.on('startGame', function(data) {
        console.log('Game started with opponent:', data.opponent);
        gameHasStarted = true;
        opponentName = data.opponent;
        $opponentName.text('Opponent: ' + opponentName);
        
        // Initialize WebRTC after both players joined
        setTimeout(() => {
            initializeWebRTC();
        }, 500);
        
        updateStatus();
    });
    
    socket.on('waitingForOpponent', function() {
        $status.html('Waiting for opponent to join. Share your game code!');
    });
    
    socket.on('newMove', function(move) {
        game.move(move);
        board.position(game.fen());
        updateStatus();
        
        // Check if game is over after opponent's move
        if (game.game_over()) {
            handleGameOver();
        }
    });
    
    socket.on('gameOverDisconnect', function(data) {
        gameOver = true;
        updateStatus();
        addChatMessage({
            sender: 'System',
            text: `${data.username || 'Opponent'} disconnected from the game.`,
            time: new Date().toISOString()
        });
        
        // Show win modal for disconnection
        showGameOverModal(playerColor, 'disconnect', username);
    });
    
    // Handle game ended event
    socket.on('gameEnded', function(data) {
        console.log('Game ended:', data);
        showGameOverModal(data.winner, data.reason, data.winnerName);
    });
    
    // WebRTC signaling with updated event names
    socket.on('webrtc-offer', function(data) {
        console.log('Received WebRTC offer');
        handleOffer(data);
    });
    
    socket.on('webrtc-answer', function(data) {
        console.log('Received WebRTC answer');
        handleAnswer(data);
    });
    
    socket.on('iceCandidate', function(data) {
        console.log('Received ICE candidate');
        handleIceCandidate(data);
    });
    
    // Chat messages
    socket.on('newMessage', function(message) {
        addChatMessage(message);
    });
    
    socket.on('chatHistory', function(messages) {
        if (Array.isArray(messages)) {
            messages.forEach(message => {
                addChatMessage(message);
            });
        }
    });
});