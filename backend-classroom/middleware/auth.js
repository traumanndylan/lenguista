require('dotenv').config({ path: '../.env' });
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-lenguista-key-123';

const verifyToken = (req, res, next) => {
    const token = req.cookies && req.cookies.token ? req.cookies.token : (req.header('Authorization') ? req.header('Authorization').replace('Bearer ', '') : null);

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const csrfCookie = req.cookies ? req.cookies['XSRF-TOKEN'] : null;
        const csrfHeader = req.headers['x-xsrf-token'];

        if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
            return res.status(403).json({ error: 'Invalid CSRF token.' });
        }
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (ex) {
        if (ex.name === 'TokenExpiredError') {
            res.status(401).json({ error: 'Token expired. Please log in again.' });
        } else {
            res.status(400).json({ error: 'Invalid token.' });
        }
    }
};

const requireRole = (role) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Access denied. Not authenticated.' });
        }

        if (req.user.role !== role) {
            return res.status(403).json({ error: `Access denied. Requires ${role} role.` });
        }

        next();
    };
};

module.exports = { verifyToken, requireRole, JWT_SECRET };
