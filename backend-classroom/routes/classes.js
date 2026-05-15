const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Class = require('../models/Class');
const Post = require('../models/Post');
const Meeting = require('../models/Meeting');
const PrivateComment = require('../models/PrivateComment');
const { verifyToken, requireRole } = require('../middleware/auth');

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

router.post('/', verifyToken, requireRole('Tutor'), async (req, res) => {
    try {
        const { name, description, color } = req.body;
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

router.get('/:classId/posts', verifyToken, async (req, res) => {
    try {
        const posts = await Post.find({ classId: req.params.classId }).sort({ createdAt: -1 });
        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: 'Server error fetching posts' });
    }
});

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

router.delete('/:classId/posts/:postId', verifyToken, requireRole('Tutor'), async (req, res) => {
    try {
        const targetClass = await Class.findOne({ _id: req.params.classId, tutor: req.user.id });
        if (!targetClass) {
            return res.status(404).json({ error: 'Class not found or unauthorized' });
        }

        const post = await Post.findById(req.params.postId);
        if (!post) return res.status(404).json({ error: 'Post not found' });

        if (post.type === 'meeting' && post.meetingCode) {
            await Meeting.deleteOne({ code: post.meetingCode });
        }

        await Post.deleteOne({ _id: post._id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error deleting post' });
    }
});

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

router.post('/:classId/meetings', verifyToken, requireRole('Tutor'), async (req, res) => {
    try {
        const { name, description, scheduledAt } = req.body;
        const targetClass = await Class.findOne({ _id: req.params.classId, tutor: req.user.id });
        if (!targetClass) {
            return res.status(404).json({ error: 'Class not found or unauthorized' });
        }

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

router.get('/:classId/meetings', verifyToken, async (req, res) => {
    try {
        const meetings = await Meeting.find({ classId: req.params.classId }).sort({ scheduledAt: 1 });
        res.json(meetings);
    } catch (err) {
        res.status(500).json({ error: 'Server error fetching meetings' });
    }
});

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
