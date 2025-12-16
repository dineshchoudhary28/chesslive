// server/sockets/io.js
const bcrypt = require('bcrypt');
const { getConnection } = require('../database/database');

// Queue for random matchmaking
let randomQueue = [];

module.exports = io => {
    io.on('connection', socket => {
        console.log('New socket connection', socket.id);

        let currentCode = null;
        let username = null;
        let isInRandomQueue = false;

        // User registration
        socket.on('register', async (data) => {
            console.log('Registration attempt:', data.username);
            try {
                const connection = await getConnection();
                const { username, email, password } = data;
                
                // Check if user already exists
                const [existingUsers] = await connection.execute(
                    'SELECT id FROM users WHERE username = ? OR email = ?',
                    [username, email]
                );
                
                if (existingUsers.length > 0) {
                    socket.emit('registerFailed', { message: 'Username or email already exists' });
                    return;
                }
                
                // Hash password
                const hashedPassword = await bcrypt.hash(password, 10);
                
                // Insert new user
                await connection.execute(
                    'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
                    [username, email, hashedPassword]
                );
                
                socket.emit('registerSuccess', { message: 'Registration successful' });
                console.log('User registered successfully:', username);
                
            } catch (error) {
                console.error('Registration error:', error);
                socket.emit('registerFailed', { message: 'Registration failed. Please try again.' });
            }
        });

        // User authentication
        socket.on('login', async (data) => {
            console.log('Login attempt:', data.username);
            try {
                const connection = await getConnection();
                const { username: loginUsername, password } = data;
                
                // Get user from database
                const [users] = await connection.execute(
                    'SELECT username, password FROM users WHERE username = ?',
                    [loginUsername]
                );
                
                if (users.length === 0) {
                    socket.emit('loginFailed', { message: 'Invalid username or password' });
                    return;
                }
                
                const user = users[0];
                
                // Verify password
                const passwordMatch = await bcrypt.compare(password, user.password);
                
                if (!passwordMatch) {
                    socket.emit('loginFailed', { message: 'Invalid username or password' });
                    return;
                }
                
                username = user.username;
                users[socket.id] = {
                    username: username,
                    id: socket.id
                };
                
                socket.emit('loginSuccess', { username });
                console.log('User logged in:', username);
                
            } catch (error) {
                console.error('Login error:', error);
                socket.emit('loginFailed', { message: 'Login failed. Please try again.' });
            }
        });

        // Get user profile
        socket.on('getProfile', async (data) => {
            try {
                const connection = await getConnection();
                const { username } = data;
                
                const [users] = await connection.execute(
                    'SELECT username, email FROM users WHERE username = ?',
                    [username]
                );
                
                if (users.length > 0) {
                    socket.emit('profileData', {
                        username: users[0].username,
                        email: users[0].email
                    });
                }
                
            } catch (error) {
                console.error('Get profile error:', error);
                socket.emit('profileUpdateFailed', { message: 'Failed to load profile data.' });
            }
        });

        // Update user profile
        socket.on('updateProfile', async (data) => {
            try {
                const connection = await getConnection();
                const { username, email, currentPassword, newPassword } = data;
                
                // Verify current password
                const [users] = await connection.execute(
                    'SELECT password FROM users WHERE username = ?',
                    [username]
                );
                
                if (users.length === 0) {
                    socket.emit('profileUpdateFailed', { message: 'User not found' });
                    return;
                }
                
                const passwordMatch = await bcrypt.compare(currentPassword, users[0].password);
                
                if (!passwordMatch) {
                    socket.emit('profileUpdateFailed', { message: 'Current password is incorrect' });
                    return;
                }
                
                // Update profile
                if (newPassword) {
                    // Update email and password
                    const hashedPassword = await bcrypt.hash(newPassword, 10);
                    await connection.execute(
                        'UPDATE users SET email = ?, password = ? WHERE username = ?',
                        [email, hashedPassword, username]
                    );
                } else {
                    // Update only email
                    await connection.execute(
                        'UPDATE users SET email = ? WHERE username = ?',
                        [email, username]
                    );
                }
                
                socket.emit('profileUpdateSuccess', { message: 'Profile updated successfully' });
                console.log('Profile updated for user:', username);
                
            } catch (error) {
                console.error('Update profile error:', error);
                socket.emit('profileUpdateFailed', { message: 'Failed to update profile. Please try again.' });
            }
        });

        // Random matchmaking
        socket.on('findRandomOpponent', (data) => {
            console.log('Random opponent search requested by:', data.username);
            
            if (!data.username) return;
            
            username = data.username;
            isInRandomQueue = true;
            
            // Check if there's already someone in the queue
            if (randomQueue.length > 0) {
                // Match with the first person in queue
                const opponent = randomQueue.shift();
                
                // Generate a random game code
                const gameCode = Math.random().toString(36).substring(2, 8);
                
                // Create game
                games[gameCode] = {
                    white: opponent.socketId,
                    whiteName: opponent.username,
                    black: socket.id,
                    blackName: username,
                    messages: []
                };
                
                // Notify both players
                io.to(opponent.socketId).emit('randomGameFound', {
                    gameCode: gameCode,
                    color: 'white',
                    opponent: username
                });
                
                socket.emit('randomGameFound', {
                    gameCode: gameCode,
                    color: 'black',
                    opponent: opponent.username
                });
                
                console.log(`Random match created: ${opponent.username} vs ${username}, code: ${gameCode}`);
                
                // Remove opponent from queue tracking
                const opponentSocket = io.sockets.sockets.get(opponent.socketId);
                if (opponentSocket) {
                    opponentSocket.isInRandomQueue = false;
                }
                isInRandomQueue = false;
                
            } else {
                // Add to queue
                randomQueue.push({
                    socketId: socket.id,
                    username: username
                });
                console.log(`${username} added to random queue. Queue length: ${randomQueue.length}`);
            }
        });

        // Cancel random search
        socket.on('cancelRandomSearch', () => {
            console.log('Random search canceled by:', username);
            
            // Remove from queue
            randomQueue = randomQueue.filter(player => player.socketId !== socket.id);
            isInRandomQueue = false;
            
            socket.emit('randomSearchCanceled');
        });

        // Chess moves
        socket.on('move', function(move) {
            console.log('Move detected from', username, 'in room', currentCode, ':', move);
            if (!currentCode) return;
            socket.to(currentCode).emit('newMove', move);
        });

        // Game over event
        socket.on('gameOver', function(data) {
            console.log('Game over in room', currentCode, ':', data);
            if (!currentCode) return;
            
            // Send game over notification to both players
            io.to(currentCode).emit('gameEnded', {
                winner: data.winner,
                reason: data.reason,
                winnerName: data.winnerName
            });
        });
        
        // Game joining
        socket.on('joinGame', function(data) {
            console.log('Join game request:', data);
            if (!data || !data.code) {
                console.error('Invalid join game request');
                return;
            }
            
            currentCode = data.code;
            
            // If username wasn't set from login, set it now
            if (!username && data.username) {
                username = data.username;
                users[socket.id] = {
                    username: username,
                    id: socket.id
                };
            }
            
            socket.join(currentCode);
            console.log(`${username || 'Anonymous'} joined game ${currentCode}`);
            
            // First player creates the game
            if (!games[currentCode]) {
                console.log('Creating new game with code', currentCode);
                games[currentCode] = {
                    white: socket.id,
                    whiteName: username,
                    messages: []
                };
                socket.emit('waitingForOpponent');
                return;
            }
            
            // Second player joins
            console.log('Second player joining game', currentCode);
            games[currentCode].black = socket.id;
            games[currentCode].blackName = username;
            
            // Notify both players with opponent names
            io.to(games[currentCode].white).emit('startGame', { 
                opponent: username,
                color: 'white'
            });
            
            socket.emit('startGame', { 
                opponent: games[currentCode].whiteName,
                color: 'black'
            });

            // Send chat history to new player
            if (games[currentCode].messages && games[currentCode].messages.length > 0) {
                console.log('Sending chat history to new player');
                socket.emit('chatHistory', games[currentCode].messages);
            }
        });

        // WebRTC signaling with improved handling
        socket.on('webrtc-offer', (data) => {
            console.log('WebRTC offer received from:', data.from);
            if (!currentCode) return;
            
            // Forward offer to the other player in the room
            socket.to(currentCode).emit('webrtc-offer', {
                offer: data.offer,
                from: data.from
            });
        });

        socket.on('webrtc-answer', (data) => {
            console.log('WebRTC answer received from:', data.from);
            if (!currentCode) return;
            
            // Forward answer to the other player in the room
            socket.to(currentCode).emit('webrtc-answer', {
                answer: data.answer,
                from: data.from
            });
        });

        socket.on('iceCandidate', (data) => {
            console.log('WebRTC ICE candidate received');
            if (!currentCode) return;
            
            // Forward ICE candidate to the other player in the room
            socket.to(currentCode).emit('iceCandidate', {
                candidate: data.candidate
            });
        });

        // Chat messages
        socket.on('chatMessage', (message) => {
            console.log('Chat message received:', message);
            if (!currentCode || !username) {
                console.error('Cannot send message: no room or username');
                return;
            }
            
            const messageData = {
                text: message,
                sender: username,
                time: new Date().toISOString()
            };
            
            console.log('Broadcasting message to room', currentCode);
            if (games[currentCode]) {
                // Store message in game history
                if (!games[currentCode].messages) {
                    games[currentCode].messages = [];
                }
                games[currentCode].messages.push(messageData);
                
                // Send to all players in the room (including sender for confirmation)
                io.to(currentCode).emit('newMessage', messageData);
            }
        });

        // Disconnect handling
        socket.on('disconnect', function() {
            console.log('Socket disconnected:', socket.id, username);

            // Remove from random queue if present
            if (isInRandomQueue) {
                randomQueue = randomQueue.filter(player => player.socketId !== socket.id);
                console.log(`Removed ${username} from random queue. Queue length: ${randomQueue.length}`);
            }

            // Clean up user
            if (socket.id in users) {
                delete users[socket.id];
            }

            // Notify opponent about disconnection
            if (currentCode && games[currentCode]) {
                console.log('Handling disconnect for game', currentCode);
                // Send system message about disconnection
                const disconnectMessage = {
                    text: `${username || 'Opponent'} has disconnected.`,
                    sender: 'System',
                    time: new Date().toISOString()
                };
                
                io.to(currentCode).emit('newMessage', disconnectMessage);
                io.to(currentCode).emit('gameOverDisconnect', { username });
                
                // Keep game data for a bit in case player reconnects
                setTimeout(() => {
                    if (games[currentCode]) {
                        console.log('Cleaning up game', currentCode);
                        delete games[currentCode];
                    }
                }, 60000); // Remove after 1 minute
            }
        });
    });
};