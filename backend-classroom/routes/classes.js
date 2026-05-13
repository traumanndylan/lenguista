const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Class = require('../models/Class');
const Post = require('../models/Post');
const Meeting = require('../models/Meeting');
const PrivateComment = require('../models/PrivateComment');
const { verifyToken, requireRole } = require('../middleware/auth');

// Get all classes for the current user
router.get('/', verifyToken, async (req, res) => {
    try {
        let classes;
        if (req.user.role === 'Tutor') {
            classes = await Class.find({ tutor: req.user.id });
        } else {
            classes = await Class.find({ students: req.user.id });
        }
        res.json(classes);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Create a new class (Tutor only)
router.post('/', verifyToken, requireRole('Tutor'), async (req, res) => {
    try {
        const { name, description, color } = req.body;
        // Generate a 6 character code
        let code;
        let isUnique = false;
        while (!isUnique) {
            code = crypto.randomBytes(3).toString('hex').toUpperCase();
            const existing = await Class.findOne({ code });
            if (!existing) isUnique = true;
        }

        const newClass = new Class({
            name,
            description,
            color,
            code,
            tutor: req.user.id
        });
        await newClass.save();
        res.status(201).json(newClass);
    } catch (err) {
        res.status(500).json({ error: 'Server error creating class' });
    }
});

// Join a class (Student only)
router.post('/join', verifyToken, requireRole('Student'), async (req, res) => {
    try {
        const { code } = req.body;
        const targetClass = await Class.findOne({ code: code.toUpperCase() });
        if (!targetClass) {
            return res.status(404).json({ error: 'Class not found with that code' });
        }

        if (!targetClass.students.includes(req.user.id)) {
            targetClass.students.push(req.user.id);
            await targetClass.save();
        }
        res.json(targetClass);
    } catch (err) {
        res.status(500).json({ error: 'Server error joining class' });
    }
});

// Delete a class (Tutor only)
router.delete('/:id', verifyToken, requireRole('Tutor'), async (req, res) => {
    try {
        const targetClass = await Class.findOne({ _id: req.params.id, tutor: req.user.id });
        if (!targetClass) {
            return res.status(404).json({ error: 'Class not found' });
        }
        await Class.deleteOne({ _id: targetClass._id });
        await Post.deleteMany({ classId: targetClass._id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error deleting class' });
    }
});

// Get posts for a class
router.get('/:classId/posts', verifyToken, async (req, res) => {
    try {
        const posts = await Post.find({ classId: req.params.classId }).sort({ createdAt: -1 });
        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: 'Server error fetching posts' });
    }
});

// Create a post
router.post('/:classId/posts', verifyToken, requireRole('Tutor'), async (req, res) => {
    try {
        const { type, author, title, text, score, due, attachments } = req.body;
        const targetClass = await Class.findOne({ _id: req.params.classId, tutor: req.user.id });
        if (!targetClass) {
            return res.status(404).json({ error: 'Class not found or unauthorized' });
        }

        const newPost = new Post({
            classId: targetClass._id,
            type,
            author,
            title,
            text,
            score,
            due,
            attachments
        });
        await newPost.save();
        res.status(201).json(newPost);
    } catch (err) {
        res.status(500).json({ error: 'Server error creating post' });
    }
});

// Delete a post (Tutor only)
router.delete('/:classId/posts/:postId', verifyToken, requireRole('Tutor'), async (req, res) => {
    try {
        const targetClass = await Class.findOne({ _id: req.params.classId, tutor: req.user.id });
        if (!targetClass) {
            return res.status(404).json({ error: 'Class not found or unauthorized' });
        }

        const post = await Post.findById(req.params.postId);
        if (!post) return res.status(404).json({ error: 'Post not found' });

        // If it's a meeting, we should also delete the meeting object
        if (post.type === 'meeting' && post.meetingCode) {
            await Meeting.deleteOne({ code: post.meetingCode });
        }

        await Post.deleteOne({ _id: post._id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error deleting post' });
    }
});


// Validate a meeting code
router.get('/meetings/validate/:code', verifyToken, async (req, res) => {
    try {
        const meeting = await Meeting.findOne({ code: req.params.code.toUpperCase() });
        if (!meeting) {
            return res.status(404).json({ error: 'Meeting not found or has expired' });
        }
        res.json(meeting);
    } catch (err) {
        res.status(500).json({ error: 'Server error validating meeting' });
    }
});

// Create a meeting (Tutor only)
router.post('/:classId/meetings', verifyToken, requireRole('Tutor'), async (req, res) => {
    try {
        const { name, description, scheduledAt } = req.body;
        const targetClass = await Class.findOne({ _id: req.params.classId, tutor: req.user.id });
        if (!targetClass) {
            return res.status(404).json({ error: 'Class not found or unauthorized' });
        }

        // Generate a unique 6-char meeting code
        let code;
        let isUnique = false;
        while (!isUnique) {
            code = crypto.randomBytes(3).toString('hex').toUpperCase();
            const existing = await Meeting.findOne({ code });
            if (!existing) isUnique = true;
        }

        const newMeeting = new Meeting({
            classId: targetClass._id,
            name,
            description,
            scheduledAt: new Date(scheduledAt),
            code,
            createdBy: req.user.id
        });
        await newMeeting.save();

        // Also create a feed post so the meeting shows in the class stream
        const meetingPost = new Post({
            classId: targetClass._id,
            type: 'meeting',
            author: req.user.username,
            title: name,
            text: description,
            meetingCode: code,
            meetingDate: new Date(scheduledAt)
        });
        await meetingPost.save();

        res.status(201).json(newMeeting);
    } catch (err) {
        console.error('Error creating meeting:', err);
        res.status(500).json({ error: 'Server error creating meeting' });
    }
});

// Get meetings for a class
router.get('/:classId/meetings', verifyToken, async (req, res) => {
    try {
        const meetings = await Meeting.find({ classId: req.params.classId }).sort({ scheduledAt: 1 });
        res.json(meetings);
    } catch (err) {
        res.status(500).json({ error: 'Server error fetching meetings' });
    }
});

// Create a private comment on a post
router.post('/:classId/posts/:postId/comments', verifyToken, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'Comment text is required' });
        }

        const newComment = new PrivateComment({
            postId: req.params.postId,
            classId: req.params.classId,
            authorId: req.user.id,
            authorName: req.user.username,
            authorRole: req.user.role,
            text: text.trim()
        });
        await newComment.save();
        res.status(201).json(newComment);
    } catch (err) {
        console.error('Error creating comment:', err);
        res.status(500).json({ error: 'Server error creating comment' });
    }
});

router.get('/:classId/posts/:postId/comments', verifyToken, async (req, res) => {
    try {
        let query = {
            postId: req.params.postId,
            classId: req.params.classId
        };

        if (req.user.role === 'Student') {
            const studentComments = await PrivateComment.find({
                postId: req.params.postId,
                classId: req.params.classId,
                $or: [
                    { authorId: req.user.id },
                    { authorRole: 'Tutor' }
                ]
            }).sort({ createdAt: 1 });
            return res.json(studentComments);
        }

        const comments = await PrivateComment.find(query).sort({ createdAt: 1 });
        res.json(comments);
    } catch (err) {
        res.status(500).json({ error: 'Server error fetching comments' });
    }
});

module.exports = router;
