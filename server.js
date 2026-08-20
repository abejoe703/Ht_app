"use strict";

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

/* =========================================
   STATIC FILE
========================================= */

const publicPath = path.join(__dirname, "public");

app.use(express.static(publicPath));

/* =========================================
   HOME
========================================= */

app.get("/", (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
});

/* =========================================
   HEALTH CHECK
========================================= */

app.get("/health", (req, res) => {
    res.json({
        status: "online",
        app: "AbeJoe HT",
        time: new Date().toISOString()
    });
});

/* =========================================
   SOCKET.IO
========================================= */

io.on("connection", (socket) => {

    console.log("HT connected:", socket.id);

    socket.on("join-channel", (channel) => {

        if (!channel) return;

        socket.join(channel);

        console.log(
            `${socket.id} joined channel ${channel}`
        );

        socket.to(channel).emit("user-joined", {
            id: socket.id
        });
    });

    socket.on("audio-stream", (data) => {

        socket.broadcast.emit(
            "audio-stream",
            data
        );
    });

    socket.on("radio-message", (data) => {

        socket.broadcast.emit(
            "radio-message",
            data
        );
    });

    socket.on("disconnect", () => {

        console.log(
            "HT disconnected:",
            socket.id
        );
    });

});

/* =========================================
   START SERVER
========================================= */

const PORT = process.env.PORT || 10000;

server.listen(PORT, "0.0.0.0", () => {

    console.log(
        `AbeJoe HT berjalan pada port ${PORT}`
    );

});
