require('dotenv').config({ path: '../.env' });
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const crypto = require('crypto');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const { verifyToken, requireRole } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 8001;

const folderID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const driveService = google.drive({ version: 'v3', auth: oauth2Client });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
    if (req.method === 'GET' && !req.cookies['XSRF-TOKEN']) {
        const csrfToken = crypto.randomBytes(32).toString('hex');
        res.cookie('XSRF-TOKEN', csrfToken, {
            sameSite: 'Lax',
            secure: process.env.NODE_ENV === 'production',
            httpOnly: false
        });
    }
    next();
});

mongoose.connect(process.env.MONGODB_URI || 'mongodb://database:27017/lenguista')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

app.use('/api/auth', authRoutes);

const classesRoutes = require('./routes/classes');
app.use('/api/classes', classesRoutes);

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 512 * 1024 * 1024 }
});

app.post('/api/upload', verifyToken, requireRole('Tutor'), upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const fileSize = fs.statSync(req.file.path).size;
        console.log(`\n[E2EE Upload] Received encrypted file: ${req.file.originalname}`);
        console.log(`[E2EE Upload] Saved to temporary disk at ${req.file.path} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

        const fileMetadata = {
            'name': req.file.originalname,
            'parents': [folderID]
        };
        const media = {
            mimeType: 'application/octet-stream',
            body: fs.createReadStream(req.file.path)
        };

        console.log(`[E2EE Upload] Starting Resumable stream to Google Drive...`);

        const response = await driveService.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, name'
        }, {
            onUploadProgress: evt => {
                const progress = (evt.bytesRead / fileSize) * 100;
                console.log(`[GDrive Progress] ${Math.round(progress)}% complete (${evt.bytesRead} / ${fileSize} bytes)`);
            }
        });

        fs.unlink(req.file.path, (err) => {
            if (err) {
                console.error('[E2EE Upload] Error deleting local temp file:', err);
            } else {
                console.log(`[E2EE Upload] Upload finished! Local temp file deleted for maximum privacy.`);
            }
        });

        res.json({
            message: 'Encrypted file uploaded successfully to Google Drive',
            file: req.file.filename,
            driveId: response.data.id
        });
    } catch (error) {
        console.error('[E2EE Upload] Error uploading to Google Drive:', error);
        res.status(500).json({ error: 'Error uploading to Google Drive', details: error.message });
    }
});


app.get('/api/download/:driveId', verifyToken, async (req, res) => {
    try {
        const driveId = req.params.driveId;
        const response = await driveService.files.get({
            fileId: driveId,
            alt: 'media'
        }, { responseType: 'stream' });

        res.setHeader('Content-Type', 'application/octet-stream');

        response.data
            .on('end', () => console.log(`[E2EE Download] Successfully streamed ${driveId} to client`))
            .on('error', err => {
                console.error('[E2EE Download] Stream error', err);
                res.status(500).end();
            })
            .pipe(res);

    } catch (error) {
        console.error('[E2EE Download] Error downloading from Google Drive:', error);
        res.status(500).json({ error: 'Error downloading file', details: error.message });
    }
});


app.listen(PORT, () => {
    console.log(`Classroom server running on port ${PORT}`);
});