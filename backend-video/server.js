require('dotenv').config({ path: '../.env' });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

let connectedUsers = {};

function getUsersInRoom(roomName) {
    const clients = io.sockets.adapter.rooms.get(roomName);
    return clients ? Array.from(clients) : [];
}

io.on('connection', (socket) => {
    const roomID = socket.handshake.query.room || 'Main-Room';
    console.log(`New user connected: ${socket.id} to room: ${roomID}`);
    
    socket.join(roomID);
    connectedUsers[socket.id] = roomID;

    socket.to(roomID).emit('new_peer', { userId: socket.id });
    
    const existingPeers = getUsersInRoom(roomID).filter(id => id !== socket.id);
    socket.emit('peer_list', existingPeers);

    socket.on('request_breakout', (data) => {
        const { groupSize, duration } = data;
        const currentRoom = connectedUsers[socket.id];
        if (!currentRoom) return;

        const usersInRoom = getUsersInRoom(currentRoom);
        const shuffled = [...usersInRoom].sort(() => Math.random() - 0.5);

        shuffled.forEach((userId, index) => {
            const studentSocket = io.sockets.sockets.get(userId);
            if (studentSocket) {
                const groupNum = Math.floor(index / groupSize) + 1;
                const newRoomName = `${currentRoom}-Group-${groupNum}`;
                
                studentSocket.leave(currentRoom);
                studentSocket.join(newRoomName);
                
                io.to(userId).emit('room_change', { roomName: newRoomName, duration: duration });
                
                const peers = getUsersInRoom(newRoomName).filter(id => id !== userId);
                io.to(userId).emit('peer_list', peers);
                studentSocket.to(newRoomName).emit('new_peer', { userId: userId });
            }
        });
    });

    socket.on('end_breakout', () => {
        const originalRoom = connectedUsers[socket.id];
        
        Object.keys(connectedUsers).forEach(userId => {
            if (connectedUsers[userId] === originalRoom) {
                const studentSocket = io.sockets.sockets.get(userId);
                if (studentSocket) {
                    studentSocket.rooms.forEach(room => {
                        if (room !== userId) studentSocket.leave(room);
                    });
                    
                    studentSocket.join(originalRoom);
                    
                    io.to(userId).emit('room_change', { roomName: originalRoom });
                    
                    const peers = getUsersInRoom(originalRoom).filter(id => id !== userId);
                    io.to(userId).emit('peer_list', peers);
                    
                    studentSocket.to(originalRoom).emit('new_peer', { userId: userId });
                }
            }
        });
    });

    socket.on('webrtc_offer', (data) => {
        socket.to(data.recipient).emit('webrtc_offer', { sender: socket.id, offer: data.offer });
    });

    socket.on('webrtc_answer', (data) => {
        socket.to(data.recipient).emit('webrtc_answer', { sender: socket.id, answer: data.answer });
    });

    socket.on('ice_candidate', (data) => {
        socket.to(data.recipient).emit('ice_candidate', { sender: socket.id, candidate: data.candidate });
    });

    socket.on('send_message', (data) => {
        const roomID = connectedUsers[socket.id];
        if (roomID) {
            socket.to(roomID).emit('new_message', { sender: socket.id, text: data.text });
        }
    });

    socket.on('draw_whiteboard', (data) => {
        const roomID = connectedUsers[socket.id];
        if (roomID) {
            socket.to(roomID).emit('draw_whiteboard', { sender: socket.id, ...data });
        }
    });

    socket.on('toggle_audio', (data) => {
        const roomID = connectedUsers[socket.id];
        if (roomID) {
            socket.to(roomID).emit('toggle_audio', { userId: socket.id, enabled: data.enabled });
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const roomID = connectedUsers[socket.id];
        delete connectedUsers[socket.id];
        socket.broadcast.to(roomID).emit('peer_left', { userId: socket.id });
    });
});

const PORT = 8000;
server.listen(PORT, () => {
    console.log(`Backend video server listening on port ${PORT}`);
});