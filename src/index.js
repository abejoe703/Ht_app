import { DurableObject } from "cloudflare:workers";

/* =========================================================
   ABEJOE HT
   CLOUDFLARE WORKER
   WEBSOCKET + DURABLE OBJECT
   WEBRTC SIGNALING
========================================================= */

export default {
    async fetch(request, env) {

        const url = new URL(request.url);

        /* =================================================
           HEALTH CHECK
        ================================================= */

        if (url.pathname === "/health") {

            return Response.json({
                status: "online",
                app: "AbeJoe HT",
                websocket: true,
                webrtc: true,
                time: new Date().toISOString()
            });
        }


        /* =================================================
           WEBSOCKET
        ================================================= */

        if (
            url.pathname === "/ws" &&
            request.headers.get("Upgrade")
                ?.toLowerCase() === "websocket"
        ) {

            const channel =
                url.searchParams.get("channel")
                || "1";

            const id =
                env.HT_ROOM.idFromName(
                    channel
                );

            const room =
                env.HT_ROOM.get(id);

            return room.fetch(request);
        }


        /* =================================================
           STATIC FILES
        ================================================= */

        return env.ASSETS.fetch(request);
    }
};


/* =========================================================
   DURABLE OBJECT
========================================================= */

export class HTRoom extends DurableObject {

    constructor(ctx, env) {

        super(ctx, env);

        this.ctx = ctx;
        this.env = env;

        this.clients = new Map();
    }


    /* =====================================================
       FETCH
    ===================================================== */

    async fetch(request) {

        if (
            request.headers.get("Upgrade")
                ?.toLowerCase() !== "websocket"
        ) {

            return new Response(
                "AbeJoe HT WebSocket Server",
                {
                    status: 426
                }
            );
        }


        const pair =
            new WebSocketPair();

        const client =
            pair[0];

        const server =
            pair[1];


        this.ctx.acceptWebSocket(server);


        const clientId =
            crypto.randomUUID();


        const url =
            new URL(request.url);


        const channel =
            url.searchParams.get(
                "channel"
            ) || "1";


        this.clients.set(
            clientId,
            {
                socket: server,
                callsign: "HT",
                channel
            }
        );


        server.serializeAttachment({
            clientId,
            channel
        });


        /* =================================================
           SEND CONNECTION INFO
        ================================================= */

        server.send(
            JSON.stringify({

                type: "connected",

                clientId,

                channel,

                users:
                    this.clients.size

            })
        );


        /* =================================================
           UPDATE USER COUNT
        ================================================= */

        this.broadcast({

            type: "users",

            count:
                this.clients.size

        });


        return new Response(
            null,
            {
                status: 101,
                webSocket: client
            }
        );
    }


    /* =====================================================
       MESSAGE
    ===================================================== */

    async webSocketMessage(
        ws,
        message
    ) {

        let data;

        try {

            if (
                typeof message !==
                "string"
            ) {
                return;
            }

            data =
                JSON.parse(message);

        } catch {

            ws.send(
                JSON.stringify({

                    type: "error",

                    message:
                        "Invalid JSON"

                })
            );

            return;
        }


        const attachment =
            ws.deserializeAttachment();


        if (!attachment) {
            return;
        }


        const senderId =
            attachment.clientId;


        const sender =
            this.clients.get(
                senderId
            );


        if (!sender) {
            return;
        }


        /* =================================================
           JOIN
        ================================================= */

        if (
            data.type === "join"
        ) {

            sender.callsign =
                String(
                    data.callsign
                    || "HT"
                ).substring(
                    0,
                    20
                );


            ws.serializeAttachment({
                clientId: senderId,
                channel:
                    sender.channel,
                callsign:
                    sender.callsign
            });


            this.broadcast(
                {

                    type:
                        "user-joined",

                    clientId:
                        senderId,

                    callsign:
                        sender.callsign,

                    users:
                        this.clients.size

                },
                senderId
            );


            return;
        }


        /* =================================================
           PTT START
        ================================================= */

        if (
            data.type ===
            "ptt-start"
        ) {

            this.broadcast(
                {

                    type:
                        "ptt-start",

                    clientId:
                        senderId,

                    callsign:
                        sender.callsign

                },
                senderId
            );

            return;
        }


        /* =================================================
           PTT STOP
        ================================================= */

        if (
            data.type ===
            "ptt-stop"
        ) {

            this.broadcast(
                {

                    type:
                        "ptt-stop",

                    clientId:
                        senderId,

                    callsign:
                        sender.callsign

                },
                senderId
            );

            return;
        }


        /* =================================================
           WEBRTC OFFER
        ================================================= */

        if (
            data.type ===
            "webrtc-offer"
        ) {

            this.sendTo(
                data.target,
                {

                    type:
                        "webrtc-offer",

                    sender:
                        senderId,

                    offer:
                        data.offer

                }
            );

            return;
        }


        /* =================================================
           WEBRTC ANSWER
        ================================================= */

        if (
            data.type ===
            "webrtc-answer"
        ) {

            this.sendTo(
                data.target,
                {

                    type:
                        "webrtc-answer",

                    sender:
                        senderId,

                    answer:
                        data.answer

                }
            );

            return;
        }


        /* =================================================
           ICE CANDIDATE
        ================================================= */

        if (
            data.type ===
            "webrtc-ice"
        ) {

            this.sendTo(
                data.target,
                {

                    type:
                        "webrtc-ice",

                    sender:
                        senderId,

                    candidate:
                        data.candidate

                }
            );

            return;
        }


        /* =================================================
           RADIO MESSAGE
        ================================================= */

        if (
            data.type ===
            "radio-message"
        ) {

            this.broadcast(
                {

                    type:
                        "radio-message",

                    clientId:
                        senderId,

                    callsign:
                        sender.callsign,

                    message:
                        String(
                            data.message
                            || ""
                        ).substring(
                            0,
                            500
                        ),

                    time:
                        Date.now()

                },
                senderId
            );

            return;
        }
    }


    /* =====================================================
       CLOSE
    ===================================================== */

    async webSocketClose(
        ws
    ) {

        const attachment =
            ws.deserializeAttachment();


        if (!attachment) {
            return;
        }


        const clientId =
            attachment.clientId;


        const user =
            this.clients.get(
                clientId
            );


        this.clients.delete(
            clientId
        );


        this.broadcast({

            type:
                "user-left",

            clientId,

            callsign:
                user?.callsign
                || "HT",

            users:
                this.clients.size

        });
    }


    /* =====================================================
       ERROR
    ===================================================== */

    async webSocketError(
        ws
    ) {

        const attachment =
            ws.deserializeAttachment();


        if (!attachment) {
            return;
        }


        this.clients.delete(
            attachment.clientId
        );


        this.broadcast({

            type:
                "users",

            count:
                this.clients.size

        });
    }


    /* =====================================================
       SEND TO CLIENT
    ===================================================== */

    sendTo(
        clientId,
        data
    ) {

        const client =
            this.clients.get(
                clientId
            );


        if (!client) {
            return;
        }


        try {

            client.socket.send(
                JSON.stringify(data)
            );

        } catch {

            this.clients.delete(
                clientId
            );
        }
    }


    /* =====================================================
       BROADCAST
    ===================================================== */

    broadcast(
        data,
        except = null
    ) {

        const message =
            JSON.stringify(data);


        for (
            const [
                clientId,
                client
            ]
            of this.clients
        ) {

            if (
                clientId ===
                except
            ) {
                continue;
            }


            try {

                client.socket.send(
                    message
                );

            } catch {

                this.clients.delete(
                    clientId
                );
            }
        }
    }
}
