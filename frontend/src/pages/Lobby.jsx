import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { io } from 'socket.io-client';
import { Users, Play, Loader2, LogOut, User } from 'lucide-react';

const Lobby = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [socket, setSocket] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const [error, setError] = useState('');

    // Extract game code from URL if present (from old app redirect logic)
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const err = urlParams.get('error');
        if (err === 'invalidCode') {
            setError('Invalid or expired game code.');
            // Remove query param
            window.history.replaceState({}, '', '/lobby');
        }
    }, []);

    useEffect(() => {
        const newSocket = io('http://localhost:3037', { transports: ['websocket'] });
        setSocket(newSocket);

        // When random server matches us
        newSocket.on('randomGameFound', (data) => {
            setIsSearching(false);
            navigate(`/game/${data.color}?code=${data.gameCode}`);
        });

        newSocket.on('randomSearchCanceled', () => {
            setIsSearching(false);
        });

        return () => newSocket.disconnect();
    }, [navigate]);

    const findRandom = () => {
        if (!socket) return;
        setIsSearching(true);
        setError('');
        socket.emit('findRandomOpponent', { username: user.username });
    };

    const cancelSearch = () => {
        if (!socket) return;
        socket.emit('cancelRandomSearch');
    };

    const handleJoinGame = (e) => {
        e.preventDefault();
        if (!joinCode.trim()) return;
        navigate(`/game/black?code=${joinCode}`);
    };

    const createGame = () => {
        const code = Math.random().toString(36).substring(2, 8);
        navigate(`/game/white?code=${code}`);
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-dark-900 px-4 py-8">
            {/* Header */}
            <header className="max-w-5xl mx-auto flex justify-between items-center mb-12 bg-dark-800 p-4 rounded-2xl border border-gray-700/50">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-500 to-purple-500 bg-clip-text text-transparent">
                    ChessLive
                </h1>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/profile')}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-dark-900 rounded-xl transition-colors text-gray-300"
                    >
                        <User size={18} />
                        <span className="font-medium">{user?.username}</span>
                    </button>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-red-400/10 rounded-xl transition-colors"
                    >
                        <LogOut size={18} />
                        <span className="hidden sm:inline font-medium">Logout</span>
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8">

                {/* Play Online Card */}
                <div className="bg-dark-800 p-8 rounded-3xl border border-gray-700/50 flex flex-col items-center justify-center text-center space-y-6">
                    <div className="w-20 h-20 bg-primary-500/20 rounded-2xl flex items-center justify-center text-primary-500 mb-2">
                        <Users size={40} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-2">Play Online</h2>
                        <p className="text-gray-400 max-w-sm mx-auto">
                            Match with a random player online and play chess instantly.
                        </p>
                    </div>

                    {isSearching ? (
                        <div className="w-full space-y-4">
                            <div className="flex items-center justify-center gap-3 text-primary-400 font-medium py-4">
                                <Loader2 className="animate-spin" size={24} />
                                Searching for opponent...
                            </div>
                            <button
                                onClick={cancelSearch}
                                className="w-full bg-dark-900 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-3 rounded-xl transition-all font-medium"
                            >
                                Cancel Search
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={findRandom}
                            className="w-full bg-primary-600 hover:bg-primary-500 text-white font-medium py-4 rounded-xl transition-all shadow-lg shadow-primary-500/30 flex items-center justify-center gap-2 text-lg"
                        >
                            <Play size={20} fill="currentColor" />
                            Find Match
                        </button>
                    )}
                </div>

                {/* Play with Friend Card */}
                <div className="bg-dark-800 p-8 rounded-3xl border border-gray-700/50 flex flex-col justify-between">
                    <div>
                        <div className="w-20 h-20 bg-purple-500/20 rounded-2xl flex items-center justify-center text-purple-400 mb-6">
                            <Users size={40} />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Play with a Friend</h2>
                        <p className="text-gray-400 mb-8">
                            Create a new room to play with a friend, or join an existing room using a code.
                        </p>
                    </div>

                    <div className="space-y-6">
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={createGame}
                            className="w-full bg-dark-900 hover:bg-dark-900/80 text-purple-400 border border-purple-500/30 font-medium py-3 rounded-xl transition-all"
                        >
                            Create New Game
                        </button>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-700"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-dark-800 text-gray-400">or</span>
                            </div>
                        </div>

                        <form onSubmit={handleJoinGame} className="flex gap-3">
                            <input
                                type="text"
                                velue={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toLowerCase())}
                                placeholder="Enter room code"
                                className="flex-1 px-4 py-3 bg-dark-900 border border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-white font-mono uppercase"
                                required
                            />
                            <button
                                type="submit"
                                className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl font-medium transition-all"
                            >
                                Join Room
                            </button>
                        </form>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Lobby;
