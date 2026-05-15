const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    type: { type: String, enum: ['announcement', 'assignment', 'meeting'], required: true },
    author: { type: String, required: true },
    title: { type: String, required: true },
    text: { type: String },
    score: { type: Number },
    due: { type: Date },
    meetingCode: { type: String },
    meetingDate: { type: Date },
    attachments: [{
        type: { type: String, enum: ['file', 'link'] },
        name: String,
        url: String,
        size: String,
        driveId: String,
        mimeType: String
    }]
}, { timestamps: true });

module.exports = mongoose.model('Post', postSchema);
