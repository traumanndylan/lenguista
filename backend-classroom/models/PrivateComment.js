const mongoose = require('mongoose');

const privateCommentSchema = new mongoose.Schema({
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, enum: ['Tutor', 'Student'], required: true },
    text: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('PrivateComment', privateCommentSchema);
