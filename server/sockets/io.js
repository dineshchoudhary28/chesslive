// server/sockets/io.js
module.exports = io => {
    io.on('connection', socket => {
        console.log('New socket connection');

        let currentCode = null;
        let username = null;

        // User authentication
        socket.on('login', (data) => {
            username = data.username;
            users[socket.id] = {
                username: username,
                id: socket.id
            };
            socket.emit('loginSuccess', { username });
        });

        // Chess moves
        socket.on('move', function(move) {
            console.log('Move detected from', username);
            io.to(currentCode).emit('newMove', move);
        });
        
        // Game joining
        socket.on('joinGame', function(data) {
            currentCode = data.code;
            socket.join(currentCode);
            
            // First player creates the game
            if (!games[currentCode]) {
                games[currentCode] = {
                    white: socket.id,
                    whiteName: username,
                    messages: []
                };
                socket.emit('waitingForOpponent');
                return;
            }
            
            // Second player joins
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
        });

        // WebRTC signaling
        socket.on('offer', (data) => {
            io.to(currentCode).emit('offer', data);
        });

        socket.on('answer', (data) => {
            io.to(currentCode).emit('answer', data);
        });

        socket.on('iceCandidate', (data) => {
            io.to(currentCode).emit('iceCandidate', data);
        });

        // Chat messages
        socket.on('chatMessage', (message) => {
            if (!currentCode || !username) return;
            
            const messageData = {
                text: message,
                sender: username,
                time: new Date().toLocaleTimeString()
            };
            
            if (games[currentCode]) {
                games[currentCode].messages.push(messageData);
                io.to(currentCode).emit('newMessage', messageData);
            }
        });

        // Disconnect handling
        socket.on('disconnect', function() {
            console.log('Socket disconnected:', username);

            // Clean up user
            if (socket.id in users) {
                delete users[socket.id];
            }

            // Notify opponent about disconnection
            if (currentCode && games[currentCode]) {
                io.to(currentCode).emit('gameOverDisconnect', { username });
                delete games[currentCode];
            }
        });
    });
};