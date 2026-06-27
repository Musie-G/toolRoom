// server.js
// express app - boots here, routes are in /routes
// no models folder this time - using raw sql queries directly in routes
// same approach as the original api.php just split into separate files

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const { connectDB } = require('./config');

const app = express();

// connect to mysql before anything else
connectDB();

app.use(cors({
    origin: process.env.CLIENT_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// frontend lives one level up from server/
app.use(express.static(path.join(__dirname, '..')));

// routes
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/tools',       require('./routes/tools'));
app.use('/api/employees',   require('./routes/employees'));
app.use('/api/checkouts',   require('./routes/checkouts'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/settings',    require('./routes/settings.js'));

// unknown api routes
/*app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'unknown endpoint: ' + req.originalUrl });
});
*/

// unknown api routes - must come AFTER all specific /api routes
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'unknown endpoint: ' + req.originalUrl });
    } else {
        next();
    }
});
/*// SPA fallback - send index.html for any non-api route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});
*/  
// SPA fallback - send index.html for any non-api route
app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// last-resort error handler
app.use((err, req, res, next) => {
    console.error('unhandled error in', req.method, req.path, ':', err.message);
    res.status(500).json({ error: 'something went wrong on the server' });
});

// 3000 because 80 is taken by xampp apache
var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
    console.log('toolroom server up on port ' + PORT);
    if (process.env.NODE_ENV !== 'production') {
        console.log('dev mode - open http://localhost:' + PORT + '/login.html');
    }
});

module.exports = app;
