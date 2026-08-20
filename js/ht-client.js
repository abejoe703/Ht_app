"use strict";

/* =========================================================
   ABEJOE HT
   HT CLIENT
   WebSocket + PTT + WebRTC
========================================================= */

let socket = null;
let localStream = null;

const peers = new Map();

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
   CONFIG
========================================================= */

const RTC_CONFIG = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun:stun.cloudflare.com:3478"
        }
    ]
};


/* =========================================================
   STORAGE
========================================================= */

callsignEl.value =
    localStorage.getItem("abejoe_callsign")
    || "ABEJOE";

channelEl.value =
    localStorage.getItem("abejoe_channel")
    || "1";


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


saveSettings();


callsignEl.addEventListener(
    "change",
    saveSettings
);

channelEl.addEventListener(
    "change",
    saveSettings
);


/* =========================================================
   LOG
========================================================= */

function addLog(
    message,
    type = "system"
) {

    if (!logEl) return;

    const item =
        document.createElement("div");

    item.className =
        "log-item " + type;

    const time =
        new Date().toLocaleTimeString(
            "id-ID",
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        );

    item.textContent =
        `[${time}] ${message}`;

    logEl.appendChild(item);

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
        socket.readyState !== WebSocket.OPEN
    ) {
        return false;
    }

    socket.send(
        JSON.stringify(data)
    );

    return true;
}


/* =========================================================
   CONNECT
========================================================= */

async function connectHT() {

    saveSettings();

    if (
        socket &&
        socket.readyState === WebSocket.OPEN
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
            "Microphone tidak tersedia: " +
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
            channelEl.value.trim() || "1"
        );


    const url =
        `${protocol}//${location.host}/ws?channel=${channel}`;


    addLog(
        "Menghubungkan ke server...",
        "system"
    );


    socket =
        new WebSocket(url);


    socket.onopen =
        async function() {

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

                type: "join",

                channel:
                    channelEl.value.trim() || "1",

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
                    JSON.parse(event.data);

            } catch {

                return;
            }


            await handleServerMessage(data);
        };


    socket.onerror =
        function() {

            setStatus(
                false,
                "CONNECTION ERROR"
            );

            addLog(
                "Koneksi server error.",
                "system"
            );
        };


    socket.onclose =
        function() {

            setStatus(
                false,
                "SERVER OFFLINE"
            );

            radioState.textContent =
                "STANDBY";

            radioState.className =
                "radio-state";

            closeAllPeers();

            addLog(
                "Koneksi terputus.",
                "system"
            );

            socket = null;
        };
}


/* =========================================================
   SERVER MESSAGE
========================================================= */

async function handleServerMessage(data) {

    switch (data.type) {

        case "connected":

            usersEl.textContent =
                data.users || 1;

            break;


        case "users":

            usersEl.textContent =
                data.count || 0;

            break;


        case "user-joined":

            usersEl.textContent =
                data.users || 0;

            addLog(
                `${data.callsign || "HT"} bergabung`,
                "system"
            );

            /*
             * User baru harus menerima offer
             * dari client yang sudah berada
             * di channel.
             */

            if (data.clientId) {

                await createPeer(
                    data.clientId,
                    true
                );
            }

            break;


        case "user-left":

            if (data.clientId) {

                removePeer(
                    data.clientId
                );
            }

            break;


        case "ptt-start":

            radioState.textContent =
                "RX";

            radioState.className =
                "radio-state rx-state";

            addLog(
                `${data.callsign || "HT"} TRANSMIT`,
                "rx"
            );

            break;


        case "ptt-stop":

            if (!isPTT) {

                radioState.textContent =
                    "STANDBY";

                radioState.className =
                    "radio-state";
            }

            break;


        /* =============================================
           WEBRTC OFFER
        ============================================= */

        case "webrtc-offer":

            await receiveOffer(data);

            break;


        /* =============================================
           WEBRTC ANSWER
        ============================================= */

        case "webrtc-answer":

            await receiveAnswer(data);

            break;


        /* =============================================
           ICE
        ============================================= */

        case "webrtc-ice":

            await receiveICE(data);

            break;


        default:

            break;
    }
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
            "Browser tidak mendukung microphone"
        );
    }


    localStream =
        await navigator.mediaDevices.getUserMedia({

            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },

            video: false
        });


    /*
     * Awalnya microphone mute.
     * Audio baru aktif ketika PTT ditekan.
     */

    localStream
        .getAudioTracks()
        .forEach(
            track => {
                track.enabled = false;
            }
        );


    addLog(
        "Microphone siap.",
        "system"
    );


    return localStream;
}


/* =========================================================
   CREATE PEER
========================================================= */

async function createPeer(
    remoteId,
    initiator = false
) {

    if (peers.has(remoteId)) {

        return peers.get(remoteId);
    }


    const pc =
        new RTCPeerConnection(
            RTC_CONFIG
        );


    peers.set(
        remoteId,
        pc
    );


    /*
     * Tambahkan microphone.
     */

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


    /*
     * ICE candidate.
     */

    pc.onicecandidate =
        function(event) {

            if (!event.candidate) {
                return;
            }


            send({

                type: "webrtc-ice",

                target: remoteId,

                candidate:
                    event.candidate

            });
        };


    /*
     * Audio masuk.
     */

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


    /*
     * Connection state.
     */

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


    /*
     * Initiator membuat offer.
     */

    if (initiator) {

        const offer =
            await pc.createOffer();

        await pc.setLocalDescription(
            offer
        );


        send({

            type: "webrtc-offer",

            target: remoteId,

            offer:
                pc.localDescription

        });
    }


    return pc;
}


/* =========================================================
   RECEIVE OFFER
========================================================= */

async function receiveOffer(data) {

    if (!data.sender) {
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

        type: "webrtc-answer",

        target:
            data.sender,

        answer:
            pc.localDescription

    });
}


/* =========================================================
   RECEIVE ANSWER
========================================================= */

async function receiveAnswer(data) {

    if (!data.sender) {
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

async function receiveICE(data) {

    if (!data.sender) {
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
            "ICE error:",
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
            "audio-" + remoteId
        );


    if (!audio) {

        audio =
            document.createElement(
                "audio"
            );

        audio.id =
            "audio-" + remoteId;

        audio.autoplay = true;

        audio.playsInline = true;

        audio.volume = 1;

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
                    "Audio autoplay blocked",
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
            "audio-" + remoteId
        );


    if (audio) {

        audio.srcObject = null;

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

        removePeer(id);
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
            "CONNECT dulu.",
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


    isPTT = true;


    /*
     * Aktifkan microphone.
     */

    localStream
        .getAudioTracks()
        .forEach(
            track => {
                track.enabled = true;
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

        type: "ptt-start",

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


    isPTT = false;


    /*
     * Matikan microphone.
     */

    if (localStream) {

        localStream
            .getAudioTracks()
            .forEach(
                track => {
                    track.enabled = false;
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

        type: "ptt-stop",

        callsign:
            callsignEl.value.trim()
            || "ABEJOE"

    });
}


/* =========================================================
   PTT POINTER
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
            stopPTT(event);
        }
    }
);


/* =========================================================
   CONNECT BUTTON
========================================================= */

connectBtn.addEventListener(
    "click",
    connectHT
);


/* =========================================================
   DISCONNECT BUTTON
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

            localStream = null;
        }


        if (socket) {

            socket.close();

            socket = null;
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
    channelEl.value || "1";


addLog(
    "AbeJoe HT siap.",
    "system"
);
