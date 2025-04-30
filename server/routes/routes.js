// server/routes/routes.js
module.exports = app => {
    // Login page
    app.get('/', (req, res) => {
        res.render('login');
    });

    // Lobby page (after login)
    app.get('/lobby', (req, res) => {
        res.render('lobby');
    });

    // Game routes
    app.get('/game/:color', (req, res) => {
        const { color } = req.params;
        const { code } = req.query;
        
        // Only check game existence for black (second player)
        if (color === 'black' && (!games[code] || !games[code].white)) {
            return res.redirect('/lobby?error=invalidCode');
        }

        res.render('game', {
            color: color
        });
    });
};