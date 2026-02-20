import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { Send, Users, Video, VideoOff, Mic, MicOff, ArrowLeft, RefreshCw } from 'lucide-react';

const Game = () => {
    const { color } = useParams();
    const [searchParams] = useSearchParams();
    const gameCode = searchParams.get('code');
    const navigate = useNavigate();
    const { user } = useAuth();
    const [boardColor, setBoardColor] = useState(color);

    const [socket, setSocket] = useState(null);
    const [game, setGame] = useState(new Chess());
    const [opponent, setOpponent] = useState(null);
    const [gameStatus, setGameStatus] = useState('Waiting for opponent...');
    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const chatEndRef = useRef(null);

    // WebRTC
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const [peerConnection, setPeerConnection] = useState(null);
    const [localStream, setLocalStream] = useState(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (!gameCode || !user) {
            navigate('/lobby');
            return;
        }

        const newSocket = io('http://localhost:3037', { transports: ['websocket'] });
        setSocket(newSocket);

        newSocket.emit('joinGame', {
            code: gameCode,
            username: user.username
        });

        // --- Socket Listeners ---
        newSocket.on('waitingForOpponent', () => {
            setGameStatus('Waiting for opponent...');
        });

        newSocket.on('startGame', (data) => {
            setOpponent(data.opponent);
            setGameStatus('Game in progress');
            setBoardColor(data.color);
            if (color !== data.color) {
                // Adjust url params silently if unexpected color assignment
                window.history.replaceState({}, '', `/game/${data.color}?code=${gameCode}`);
            }
        });

        newSocket.on('newMove', (move) => {
            setGame((g) => {
                const newGame = new Chess(g.fen());
                newGame.move(move);
                checkGameOver(newGame, newSocket);
                return newGame;
            });
        });

        newSocket.on('chatHistory', (history) => {
            setMessages(history);
        });

        newSocket.on('newMessage', (msg) => {
            setMessages((prev) => [...prev, msg]);
        });

        newSocket.on('gameEnded', (data) => {
            setGameStatus(`Game Over: ${data.winnerName} won by ${data.reason}`);
        });

        newSocket.on('gameOverDisconnect', (data) => {
            setGameStatus(`Opponent disconnected. You win.`);
        });

        // --- WebRTC Listeners ---
        newSocket.on('webrtc-offer', async (data) => {
            if (!peerConnection) {
                // Wait for peer connection to establish if not ready
                console.log("Offer received but PC not ready");
                return;
            }
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                newSocket.emit('webrtc-answer', { answer, from: user.username });
            } catch (err) {
                console.error("Error handling offer:", err);
            }
        });

        newSocket.on('webrtc-answer', async (data) => {
            if (!peerConnection) return;
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            } catch (err) {
                console.error("Error setting answer:", err);
            }
        });

        newSocket.on('iceCandidate', async (data) => {
            if (!peerConnection) return;
            if (data.candidate) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        });

        return () => {
            newSocket.disconnect();
            if (localStream) localStream.getTracks().forEach(track => track.stop());
            if (peerConnection) {
                peerConnection.onicecandidate = null;
                peerConnection.ontrack = null;
                peerConnection.onnegotiationneeded = null;
                peerConnection.close();
            }
        };
    }, [gameCode, user, navigate, color]);

    // Handle Chess Moves
    const checkGameOver = (currentGameState, currentSocket) => {
        if (currentGameState.isGameOver()) {
            let reason = '';
            if (currentGameState.isCheckmate()) reason = 'Checkmate';
            else if (currentGameState.isDraw()) reason = 'Draw';
            else if (currentGameState.isStalemate()) reason = 'Stalemate';
            else if (currentGameState.isThreefoldRepetition()) reason = 'Repetition';

            let winnerName = currentGameState.turn() === 'w' ? 'Black' : 'White';
            if (currentGameState.isDraw()) winnerName = 'No one';

            if (currentSocket) {
                currentSocket.emit('gameOver', { winner: winnerName, reason, winnerName });
            }
        }
    };

    const onDrop = (sourceSquare, targetSquare) => {
        if (!socket || gameStatus.includes('Waiting') || gameStatus.includes('Over')) return false;

        // Prevent moving opponent's pieces
        if ((game.turn() === 'w' && boardColor === 'black') || (game.turn() === 'b' && boardColor === 'white')) {
            return false;
        }

        try {
            const move = game.move({
                from: sourceSquare,
                to: targetSquare,
                promotion: 'q',
            });

            if (move === null) return false;

            const newGame = new Chess(game.fen());
            setGame(newGame);
            checkGameOver(newGame, socket);

            socket.emit('move', move);
            return true;
        } catch (e) {
            return false; // Illegal move
        }
    };

    // Handle Chat
    const sendChatMessage = (e) => {
        e.preventDefault();
        if (!chatInput.trim() || !socket) return;
        socket.emit('chatMessage', chatInput);
        setChatInput('');
    };

    // Handle WebRTC Setup
    const initWebRTC = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setLocalStream(stream);
            setIsVideoEnabled(true);
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;

            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            pc.ontrack = (event) => {
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = event.streams[0];
                }
            };

            pc.onicecandidate = (event) => {
                if (event.candidate && socket) {
                    socket.emit('iceCandidate', { candidate: event.candidate });
                }
            };

            pc.onnegotiationneeded = async () => {
                try {
                    // Only the 'white' player should initiate the offer to prevent glare
                    if (boardColor === 'white') {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        socket.emit('webrtc-offer', { offer, from: user.username });
                    }
                } catch (err) {
                    console.error("Negotiation error:", err);
                }
            };

            setPeerConnection(pc);
        } catch (err) {
            console.error("Error accessing media devices.", err);
            alert("Could not access camera/microphone");
        }
    };

    const toggleVideo = () => {
        if (!localStream) {
            initWebRTC();
            return;
        }
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            setIsVideoEnabled(videoTrack.enabled);
        }
    };

    const toggleAudio = () => {
        if (!localStream) return;
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            setIsAudioEnabled(audioTrack.enabled);
        }
    };

    const restartGame = () => {
        // In a real app we'd need opponent confirmation. 
        // For now, this just visually resets locally and we need complex logic to sync it.
        // Ignoring full restart logic for brevity, just refreshing page to rejoin same room newly
        window.location.reload();
    };


    return (
        <div className="min-h-screen bg-dark-900 text-gray-200 flex flex-col">
            {/* Navbar */}
            <header className="bg-dark-800 border-b border-gray-700 p-4">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/lobby')}
                            className="p-2 hover:bg-dark-900 rounded-lg text-gray-400 hover:text-white transition-colors"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-primary-500 to-purple-500 bg-clip-text text-transparent hidden sm:block">
                            ChessLive
                        </h1>
                        <div className="bg-dark-900 px-3 py-1.5 rounded-lg border border-gray-700/50 flex items-center gap-2 text-sm font-mono text-gray-300">
                            Room Code: <span className="text-primary-400 font-bold">{gameCode}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="text-sm font-medium px-3 py-1 bg-dark-900 rounded-full border border-gray-700">
                            {gameStatus}
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-7xl mx-auto w-full p-4 grid lg:grid-cols-3 gap-6">
                {/* Left Column: Video & Game Info */}
                <div className="lg:col-span-1 space-y-6 flex flex-col">
                    {/* Opponent Info */}
                    <div className="bg-dark-800 rounded-2xl border border-gray-700/50 p-4 shadow-lg">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="bg-dark-900 p-2 rounded-lg text-red-400">
                                <Users size={20} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-white">Opponent</h3>
                                <p className="text-xs text-gray-400">{opponent || 'Waiting...'}</p>
                            </div>
                        </div>
                        {/* Remote Video */}
                        <div className="aspect-video bg-dark-900 rounded-xl overflow-hidden relative border border-gray-700/50">
                            <video
                                ref={remoteVideoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover"
                            />
                            {!opponent && (
                                <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
                                    No video feed
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Player Info */}
                    <div className="bg-dark-800 rounded-2xl border border-gray-700/50 p-4 shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-dark-900 p-2 rounded-lg text-primary-400">
                                    <span className="font-bold">{user?.username?.[0]?.toUpperCase()}</span>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-white">You ({boardColor})</h3>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={toggleAudio}
                                    className={`p-2 rounded-lg transition-colors ${isAudioEnabled ? 'bg-dark-900 text-white hover:bg-gray-700' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
                                >
                                    {isAudioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                                </button>
                                <button
                                    onClick={toggleVideo}
                                    className={`p-2 rounded-lg transition-colors ${isVideoEnabled ? 'bg-dark-900 text-white hover:bg-gray-700' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
                                >
                                    {isVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
                                </button>
                            </div>
                        </div>
                        {/* Local Video */}
                        <div className="aspect-video bg-dark-900 rounded-xl overflow-hidden relative border border-gray-700/50">
                            <video
                                ref={localVideoRef}
                                autoPlay
                                muted
                                playsInline
                                className="w-full h-full object-cover transform -scale-x-100"
                            />
                            {!isVideoEnabled && (
                                <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
                                    Camera disabled
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Center: Chessboard */}
                <div className="lg:col-span-1 flex flex-col items-center justify-center bg-dark-800 rounded-2xl border border-gray-700/50 p-6 shadow-xl relative min-h-[400px]">
                    {/* Overlay if waiting */}
                    {!opponent && (
                        <div className="absolute inset-0 z-10 bg-dark-900/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl">
                            <RefreshCw className="animate-spin text-primary-500 mb-4" size={32} />
                            <h2 className="text-xl font-bold text-white mb-2">Waiting for opponent...</h2>
                            <p className="text-gray-400 text-sm max-w-xs text-center">Share the room code {gameCode} with a friend to start playing.</p>
                        </div>
                    )}

                    <div className={`w-full max-w-[500px] ${!opponent ? 'opacity-30 blur-sm pointer-events-none' : ''}`}>
                        <Chessboard
                            position={game.fen()}
                            onPieceDrop={onDrop}
                            boardOrientation={boardColor}
                            customDarkSquareStyle={{ backgroundColor: '#4f46e5' }}
                            customLightSquareStyle={{ backgroundColor: '#e0e7ff' }}
                            animationDuration={300}
                        />
                    </div>
                </div>


                {/* Right Column: Chat */}
                <div className="lg:col-span-1 bg-dark-800 rounded-2xl border border-gray-700/50 flex flex-col shadow-lg overflow-hidden h-full max-h-[80vh]">
                    <div className="p-4 border-b border-gray-700/50 bg-dark-900/50">
                        <h3 className="font-semibold text-white flex items-center justify-between">
                            Chat
                            <span className="text-xs font-normal text-gray-500">{messages.length} messages</span>
                        </h3>
                    </div>

                    <div className="flex-1 p-4 overflow-y-auto space-y-4">
                        {messages.map((msg, idx) => {
                            const isMine = msg.sender === user?.username;
                            const isSystem = msg.sender === 'System';

                            if (isSystem) {
                                return (
                                    <div key={idx} className="flex justify-center text-xs text-gray-500 italic my-2">
                                        {msg.text}
                                    </div>
                                );
                            }

                            return (
                                <div key={idx} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                                    <span className="text-xs text-gray-500 mb-1 ml-1">{msg.sender}</span>
                                    <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm ${isMine
                                        ? 'bg-primary-600 text-white rounded-br-none'
                                        : 'bg-dark-900 text-gray-200 border border-gray-700/50 rounded-bl-none'
                                        }`}>
                                        {msg.text}
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={chatEndRef} />
                    </div>

                    <form onSubmit={sendChatMessage} className="p-4 border-t border-gray-700/50 bg-dark-900/50 flex gap-2">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Type a message..."
                            className="flex-1 bg-dark-900 border border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary-500 text-white"
                        />
                        <button
                            type="submit"
                            disabled={!chatInput.trim() || !opponent}
                            className="bg-primary-600 hover:bg-primary-500 text-white p-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Send size={18} />
                        </button>
                    </form>
                </div>

            </main>
        </div>
    );
};

export default Game;
