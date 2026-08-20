const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

io.on('connection', (socket) => {
    socket.on('audio-stream', (buffer) => {
        socket.broadcast.emit('audio-stream', buffer);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Server jalan!'));
