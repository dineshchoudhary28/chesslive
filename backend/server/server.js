// server/server.js
const http = require('http'),
      path = require('path'),
      express = require('express'),
      socket = require('socket.io'),
      cors = require('cors');

const config = require('../config');
const { connectDB } = require('./database/database');

const myIo = require('./sockets/io'),
      routes = require('./routes/routes');

const app = express(),
      server = http.Server(app),
      io = socket(server, {
        cors: {
          origin: "http://localhost:5173", // Vite default port
          methods: ["GET", "POST"]
        }
      });

app.use(cors({
  origin: 'http://localhost:5173'
}));

// Initialize database connection
connectDB().catch(err => {
    console.error('Failed to connect to database:', err);
    process.exit(1);
});

server.listen(config.port);

// Track active games and users
global.games = {};
global.users = {};

myIo(io);

console.log(`Server listening on port ${config.port}`);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

routes(app);