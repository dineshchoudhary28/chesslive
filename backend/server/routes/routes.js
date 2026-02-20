// server/routes/routes.js
module.exports = app => {
    // Health check endpoint
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', message: 'ChessLive API is running' });
    });
};