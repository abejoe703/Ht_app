"use strict";

/* =========================================================
   ABEJOE HT
   WEBRTC + WEBSOCKET + PTT
   FINAL CLIENT
========================================================= */

let socket = null;
let localStream = null;

const peers = new Map();

let myClientId = null;
let isPTT = false;


/* =========================================================
   ELEMENTS
========================================================= */

const statusEl =
    document.getElementById("status");

const callsignEl =
    document.getElementById("callsign");

const channelEl =
    document.getElementById("channel");

const channelDisplay =
    document.getElementById("channelDisplay");

const usersEl =
    document.getElementById("users");

const logEl =
    document.getElementById("log");

const radioState =
    document.getElementById("radioState");

const ptt =
    document.getElementById("ptt");

const connectBtn =
    document.getElementById("connectBtn");

const disconnectBtn =
    document.getElementById("disconnectBtn");


/* =========================================================
   WEBRTC
========================================================= */

const RTC_CONFIG = {

    iceServers: [

        {
            urls:
                "stun:stun.l.google.com:19302"
        },

        {
            urls:
                "stun:stun.cloudflare.com:3478"
        }

    ]

};


/* =========================================================
   LOCAL STORAGE
========================================================= */

callsignEl.value =
    localStorage.getItem(
        "abejoe_callsign"
    ) || "ABEJOE";


channelEl.value =
    localStorage.getItem(
        "abejoe_channel"
    ) || "1";


function saveSettings() {

    localStorage.setItem(
        "abejoe_callsign",
        callsignEl.value.trim()
    );

    localStorage.setItem(
        "abejoe_channel",
        channelEl.value.trim()
    );

    channelDisplay.textContent =
        channelEl.value.trim() || "1";
}


callsignEl.addEventListener(
    "change",
    saveSettings
);

channelEl.addEventListener(
    "change",
    saveSettings
);

saveSettings();


/* =========================================================
   LOG
========================================================= */

function addLog(
    message,
    type = "system"
) {

    if (!logEl) {
        return;
    }


    const item =
        document.createElement(
            "div"
        );


    item.className =
        "log-item " + type;


    const time =
        new Date().toLocaleTimeString(
            "id-ID",
            {
                hour:
                    "2-digit",

                minute:
                    "2-digit",

                second:
                    "2-digit"
            }
        );


    item.textContent =
        `[${time}] ${message}`;


    logEl.appendChild(
        item
    );


    logEl.scrollTop =
        logEl.scrollHeight;
}


/* =========================================================
   STATUS
========================================================= */

function setStatus(
    online,
    text
) {

    statusEl.className =
        online
            ? "status online"
            : "status offline";


    statusEl.textContent =
        online
            ? "🟢 " + text
            : "🔴 " + text;
}


/* =========================================================
   SEND
========================================================= */

function send(data) {

    if (
        !socket ||
        socket.readyState !==
            WebSocket.OPEN
    ) {

        return false;
    }


    socket.send(
        JSON.stringify(data)
    );


    return true;
}


/* =========================================================
   MICROPHONE
========================================================= */

async function startMicrophone() {

    if (localStream) {
        return localStream;
    }


    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {

        throw new Error(
            "Browser tidak mendukung microphone."
        );
    }


    localStream =
        await navigator.mediaDevices.getUserMedia({

            audio: {

                echoCancellation:
                    true,

                noiseSuppression:
                    true,

                autoGainControl:
                    true

            },

            video:
                false

        });


    /*
     * MIC default OFF.
     */

    localStream
        .getAudioTracks()
        .forEach(
            track => {
                track.enabled =
                    false;
            }
        );


    addLog(
        "Microphone siap.",
        "system"
    );


    return localStream;
}


/* =========================================================
   CONNECT
========================================================= */

async function connectHT() {

    saveSettings();


    if (
        socket &&
        socket.readyState ===
            WebSocket.OPEN
    ) {

        addLog(
            "Sudah terhubung.",
            "system"
        );

        return;
    }


    try {

        await startMicrophone();

    } catch (error) {

        addLog(
            "Microphone gagal: " +
            error.message,
            "system"
        );

        return;
    }


    const protocol =
        location.protocol === "https:"
            ? "wss:"
            : "ws:";


    const channel =
        encodeURIComponent(
            channelEl.value.trim()
            || "1"
        );


    const wsUrl =
        `${protocol}//${location.host}/ws?channel=${channel}`;


    addLog(
        "Menghubungkan ke server...",
        "system"
    );


    socket =
        new WebSocket(
            wsUrl
        );


    socket.onopen =
        function () {

            setStatus(
                true,
                "SERVER ONLINE"
            );


            addLog(
                "Terhubung channel " +
                channelEl.value,
                "system"
            );


            send({

                type:
                    "join",

                channel:
                    channelEl.value.trim()
                    || "1",

                callsign:
                    callsignEl.value.trim()
                    || "ABEJOE"

            });

        };


    socket.onmessage =
        async function(event) {

            let data;


            try {

                data =
                    JSON.parse(
                        event.data
                    );

            } catch {

                return;
            }


            await handleMessage(
                data
            );
        };


    socket.onerror =
        function () {

            setStatus(
                false,
                "CONNECTION ERROR"
            );


            addLog(
                "Server connection error.",
                "system"
            );
        };


    socket.onclose =
        function () {

            setStatus(
                false,
                "SERVER OFFLINE"
            );


            radioState.textContent =
                "STANDBY";


            radioState.className =
                "radio-state";


            closeAllPeers();


            myClientId =
                null;


            addLog(
                "Koneksi terputus.",
                "system"
            );


            socket =
                null;
        };
}


/* =========================================================
   SERVER MESSAGE
========================================================= */

async function handleMessage(
    data
) {

    /* =============================================
       CONNECTED
    ============================================= */

    if (
        data.type ===
        "connected"
    ) {

        myClientId =
            data.clientId;


        usersEl.textContent =
            data.users || 1;


        addLog(
            "ID radio: " +
            myClientId.substring(
                0,
                8
            ),
            "system"
        );


        return;
    }


    /* =============================================
       USERS
    ============================================= */

    if (
        data.type ===
        "users"
    ) {

        usersEl.textContent =
            data.count || 0;


        return;
    }


    /* =============================================
       USER JOINED
    ============================================= */

    if (
        data.type ===
        "user-joined"
    ) {

        usersEl.textContent =
            data.users || 0;


        addLog(
            `${data.callsign || "HT"} bergabung`,
            "system"
        );


        /*
         * Client lama membuat offer
         * ke client baru.
         */

        if (
            data.clientId &&
            data.clientId !==
                myClientId
        ) {

            await createPeer(
                data.clientId,
                true
            );
        }


        return;
    }


    /* =============================================
       USER LEFT
    ============================================= */

    if (
        data.type ===
        "user-left"
    ) {

        usersEl.textContent =
            data.users || 0;


        removePeer(
            data.clientId
        );


        addLog(
            `${data.callsign || "HT"} keluar`,
            "system"
        );


        return;
    }


    /* =============================================
       PTT START
    ============================================= */

    if (
        data.type ===
        "ptt-start"
    ) {

        if (
            data.clientId !==
            myClientId
        ) {

            radioState.textContent =
                "RX";


            radioState.className =
                "radio-state rx-state";


            addLog(
                `${data.callsign || "HT"} TRANSMIT`,
                "rx"
            );
        }


        return;
    }


    /* =============================================
       PTT STOP
    ============================================= */

    if (
        data.type ===
        "ptt-stop"
    ) {

        if (!isPTT) {

            radioState.textContent =
                "STANDBY";


            radioState.className =
                "radio-state";
        }


        return;
    }


    /* =============================================
       WEBRTC OFFER
    ============================================= */

    if (
        data.type ===
        "webrtc-offer"
    ) {

        await receiveOffer(
            data
        );


        return;
    }


    /* =============================================
       WEBRTC ANSWER
    ============================================= */

    if (
        data.type ===
        "webrtc-answer"
    ) {

        await receiveAnswer(
            data
        );


        return;
    }


    /* =============================================
       ICE
    ============================================= */

    if (
        data.type ===
        "webrtc-ice"
    ) {

        await receiveICE(
            data
        );


        return;
    }


    /* =============================================
       RADIO MESSAGE
    ============================================= */

    if (
        data.type ===
        "radio-message"
    ) {

        addLog(
            `${data.callsign}: ${data.message}`,
            "rx"
        );
    }
}


/* =========================================================
   CREATE PEER
========================================================= */

async function createPeer(
    remoteId,
    initiator
) {

    if (
        peers.has(
            remoteId
        )
    ) {

        return peers.get(
            remoteId
        );
    }


    const pc =
        new RTCPeerConnection(
            RTC_CONFIG
        );


    peers.set(
        remoteId,
        pc
    );


    /* =============================================
       LOCAL AUDIO
    ============================================= */

    if (localStream) {

        localStream
            .getTracks()
            .forEach(
                track => {

                    pc.addTrack(
                        track,
                        localStream
                    );

                }
            );
    }


    /* =============================================
       ICE
    ============================================= */

    pc.onicecandidate =
        function(event) {

            if (
                !event.candidate
            ) {

                return;
            }


            send({

                type:
                    "webrtc-ice",

                target:
                    remoteId,

                candidate:
                    event.candidate

            });
        };


    /* =============================================
       REMOTE AUDIO
    ============================================= */

    pc.ontrack =
        function(event) {

            const stream =
                event.streams[0];


            if (!stream) {
                return;
            }


            playRemoteAudio(
                remoteId,
                stream
            );
        };


    /* =============================================
       CONNECTION
    ============================================= */

    pc.onconnectionstatechange =
        function() {

            if (
                pc.connectionState ===
                "connected"
            ) {

                addLog(
                    "Voice link connected.",
                    "system"
                );
            }


            if (
                pc.connectionState ===
                    "failed" ||

                pc.connectionState ===
                    "closed"
            ) {

                removePeer(
                    remoteId
                );
            }
        };


    /* =============================================
       OFFER
    ============================================= */

    if (initiator) {

        const offer =
            await pc.createOffer();


        await pc.setLocalDescription(
            offer
        );


        send({

            type:
                "webrtc-offer",

            target:
                remoteId,

            offer:
                pc.localDescription

        });
    }


    return pc;
}


/* =========================================================
   RECEIVE OFFER
========================================================= */

async function receiveOffer(
    data
) {

    if (
        !data.sender ||
        !data.offer
    ) {

        return;
    }


    const pc =
        await createPeer(
            data.sender,
            false
        );


    await pc.setRemoteDescription(
        new RTCSessionDescription(
            data.offer
        )
    );


    const answer =
        await pc.createAnswer();


    await pc.setLocalDescription(
        answer
    );


    send({

        type:
            "webrtc-answer",

        target:
            data.sender,

        answer:
            pc.localDescription

    });
}


/* =========================================================
   RECEIVE ANSWER
========================================================= */

async function receiveAnswer(
    data
) {

    if (
        !data.sender ||
        !data.answer
    ) {

        return;
    }


    const pc =
        peers.get(
            data.sender
        );


    if (!pc) {
        return;
    }


    await pc.setRemoteDescription(
        new RTCSessionDescription(
            data.answer
        )
    );
}


/* =========================================================
   RECEIVE ICE
========================================================= */

async function receiveICE(
    data
) {

    if (
        !data.sender ||
        !data.candidate
    ) {

        return;
    }


    const pc =
        peers.get(
            data.sender
        );


    if (!pc) {
        return;
    }


    try {

        await pc.addIceCandidate(
            new RTCIceCandidate(
                data.candidate
            )
        );

    } catch (error) {

        console.warn(
            "ICE candidate error:",
            error
        );
    }
}


/* =========================================================
   REMOTE AUDIO
========================================================= */

function playRemoteAudio(
    remoteId,
    stream
) {

    let audio =
        document.getElementById(
            "audio-" +
            remoteId
        );


    if (!audio) {

        audio =
            document.createElement(
                "audio"
            );


        audio.id =
            "audio-" +
            remoteId;


        audio.autoplay =
            true;


        audio.playsInline =
            true;


        audio.controls =
            false;


        audio.volume =
            1;


        document.body.appendChild(
            audio
        );
    }


    audio.srcObject =
        stream;


    audio.play()
        .catch(
            error => {

                console.log(
                    "Audio autoplay:",
                    error
                );
            }
        );
}


/* =========================================================
   REMOVE PEER
========================================================= */

function removePeer(
    remoteId
) {

    if (!remoteId) {
        return;
    }


    const pc =
        peers.get(
            remoteId
        );


    if (pc) {

        try {

            pc.close();

        } catch {}
    }


    peers.delete(
        remoteId
    );


    const audio =
        document.getElementById(
            "audio-" +
            remoteId
        );


    if (audio) {

        audio.srcObject =
            null;

        audio.remove();
    }
}


/* =========================================================
   CLOSE ALL PEERS
========================================================= */

function closeAllPeers() {

    for (
        const id
        of peers.keys()
    ) {

        removePeer(
            id
        );
    }
}


/* =========================================================
   PTT START
========================================================= */

function startPTT(
    event
) {

    if (event) {
        event.preventDefault();
    }


    if (
        !socket ||
        socket.readyState !==
            WebSocket.OPEN
    ) {

        addLog(
            "Tekan CONNECT terlebih dahulu.",
            "system"
        );

        return;
    }


    if (!localStream) {

        addLog(
            "Microphone belum siap.",
            "system"
        );

        return;
    }


    if (isPTT) {
        return;
    }


    isPTT =
        true;


    /*
     * AKTIFKAN MIC
     */

    localStream
        .getAudioTracks()
        .forEach(
            track => {

                track.enabled =
                    true;
            }
        );


    ptt.classList.add(
        "transmitting"
    );


    radioState.textContent =
        "TX";


    radioState.className =
        "radio-state tx-state";


    send({

        type:
            "ptt-start",

        callsign:
            callsignEl.value.trim()
            || "ABEJOE"

    });


    addLog(
        "ANDA TRANSMIT",
        "tx"
    );
}


/* =========================================================
   PTT STOP
========================================================= */

function stopPTT(
    event
) {

    if (event) {
        event.preventDefault();
    }


    if (!isPTT) {
        return;
    }


    isPTT =
        false;


    /*
     * MATIKAN MIC
     */

    if (localStream) {

        localStream
            .getAudioTracks()
            .forEach(
                track => {

                    track.enabled =
                        false;
                }
            );
    }


    ptt.classList.remove(
        "transmitting"
    );


    radioState.textContent =
        "STANDBY";


    radioState.className =
        "radio-state";


    send({

        type:
            "ptt-stop",

        callsign:
            callsignEl.value.trim()
            || "ABEJOE"

    });
}


/* =========================================================
   PTT TOUCH / POINTER
========================================================= */

ptt.addEventListener(
    "pointerdown",
    startPTT
);


ptt.addEventListener(
    "pointerup",
    stopPTT
);


ptt.addEventListener(
    "pointercancel",
    stopPTT
);


ptt.addEventListener(
    "pointerleave",
    function(event) {

        if (event.buttons) {

            stopPTT(
                event
            );
        }
    }
);


/* =========================================================
   CONNECT
========================================================= */

connectBtn.addEventListener(
    "click",
    connectHT
);


/* =========================================================
   DISCONNECT
========================================================= */

disconnectBtn.addEventListener(
    "click",
    function() {

        if (isPTT) {

            stopPTT();
        }


        closeAllPeers();


        if (localStream) {

            localStream
                .getTracks()
                .forEach(
                    track => {

                        track.stop();
                    }
                );


            localStream =
                null;
        }


        if (socket) {

            socket.close();

            socket =
                null;
        }


        setStatus(
            false,
            "SERVER OFFLINE"
        );


        addLog(
            "Disconnected.",
            "system"
        );
    }
);


/* =========================================================
   PAGE CLOSE
========================================================= */

window.addEventListener(
    "beforeunload",
    function() {

        if (localStream) {

            localStream
                .getTracks()
                .forEach(
                    track => {

                        track.stop();
                    }
                );
        }


        if (socket) {

            socket.close();
        }
    }
);


/* =========================================================
   INITIAL
========================================================= */

channelDisplay.textContent =
    channelEl.value ||
    "1";


addLog(
    "AbeJoe HT siap digunakan.",
    "system"
);
