// server/database/database.js
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'chesslive'
};

let connection;

async function connectDB() {
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL database');
        return connection;
    } catch (error) {
        console.error('Database connection failed:', error);
        throw error;
    }
}

async function getConnection() {
    if (!connection) {
        await connectDB();
    }
    return connection;
}

module.exports = {
    connectDB,
    getConnection
};