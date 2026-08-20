import { DurableObject } from "cloudflare:workers";

/*
=========================================================
 ABEJOE HT
 CLOUDFLARE WORKER + DURABLE OBJECT
 WebSocket Radio Server
=========================================================
*/

export default {
    async fetch(request, env) {

        const url = new URL(request.url);

        /*
        ================================================
        HEALTH CHECK
        ================================================
        */

        if (url.pathname === "/health") {

            return Response.json({
                status: "online",
                app: "AbeJoe HT",
                server: "Cloudflare Worker",
                websocket: true,
                time: new Date().toISOString()
            });
        }

        /*
        ================================================
        WEBSOCKET
        ================================================
        */

        if (
            url.pathname === "/ws" &&
            request.headers.get("Upgrade") === "websocket"
        ) {

            const channel =
                url.searchParams.get("channel") || "default";

            /*
            Semua HP dengan channel yang sama
            masuk ke Durable Object yang sama.
            */

            const id =
                env.HT_ROOM.idFromName(channel);

            const room =
                env.HT_ROOM.get(id);

            return room.fetch(request);
        }

        /*
        ================================================
        STATIC WEBSITE
        ================================================
        */

        return env.ASSETS.fetch(request);
    }
};


/*
=========================================================
 DURABLE OBJECT
=========================================================
*/

export class HTRoom extends DurableObject {

    constructor(ctx, env) {

        super(ctx, env);

        this.ctx = ctx;
        this.env = env;

        /*
        Auto ping/pong supaya koneksi HT
        tetap sehat.
        */

        this.ctx.setWebSocketAutoResponse(
            new WebSocketRequestResponsePair(
                "ping",
                "pong"
            )
        );
    }


    /*
    =====================================================
    WEBSOCKET CONNECT
    =====================================================
    */

    async fetch(request) {

        if (
            request.headers.get("Upgrade")
            !== "websocket"
        ) {

            return new Response(
                "WebSocket endpoint",
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

        /*
        Accept WebSocket dengan
        Hibernation API.
        */

        this.ctx.acceptWebSocket(server);

        /*
        Data koneksi
        */

        server.serializeAttachment({
            joinedAt: Date.now(),
            channel:
                new URL(request.url)
                    .searchParams
                    .get("channel")
                || "default"
        });

        /*
        Beritahu client bahwa koneksi berhasil.
        */

        server.send(JSON.stringify({

            type: "connected",

            message:
                "AbeJoe HT connected",

            users:
                this.ctx.getWebSockets().length

        }));

        /*
        Broadcast jumlah pengguna.
        */

        this.broadcast({

            type: "users",

            count:
                this.ctx.getWebSockets().length

        }, server);

        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }


    /*
    =====================================================
    MESSAGE
    =====================================================
    */

    async webSocketMessage(ws, message) {

        let data;

        try {

            /*
            JSON message
            */

            if (typeof message === "string") {

                data =
                    JSON.parse(message);

            } else {

                return;
            }

        } catch (error) {

            ws.send(JSON.stringify({

                type: "error",

                message:
                    "Format pesan tidak valid"

            }));

            return;
        }


        /*
        =================================================
        PING
        =================================================
        */

        if (data.type === "ping") {

            ws.send(JSON.stringify({
                type: "pong"
            }));

            return;
        }


        /*
        =================================================
        JOIN
        =================================================
        */

        if (data.type === "join") {

            ws.serializeAttachment({

                joinedAt: Date.now(),

                channel:
                    data.channel || "default",

                callsign:
                    data.callsign || "HT"

            });

            this.broadcast({

                type: "user-joined",

                callsign:
                    data.callsign || "HT",

                users:
                    this.ctx.getWebSockets().length

            });

            return;
        }


        /*
        =================================================
        PTT START
        =================================================
        */

        if (data.type === "ptt-start") {

            this.broadcast({

                type: "ptt-start",

                callsign:
                    data.callsign || "HT"

            }, ws);

            return;
        }


        /*
        =================================================
        PTT STOP
        =================================================
        */

        if (data.type === "ptt-stop") {

            this.broadcast({

                type: "ptt-stop",

                callsign:
                    data.callsign || "HT"

            }, ws);

            return;
        }


        /*
        =================================================
        RADIO MESSAGE
        =================================================
        */

        if (data.type === "radio-message") {

            this.broadcast({

                type: "radio-message",

                callsign:
                    data.callsign || "HT",

                message:
                    data.message || "",

                time:
                    Date.now()

            }, ws);

            return;
        }


        /*
        =================================================
        AUDIO DATA
        =================================================
        */

        if (data.type === "audio") {

            /*
            Data audio diteruskan ke
            HP lain dalam channel.
            */

            this.broadcast({

                type: "audio",

                callsign:
                    data.callsign || "HT",

                audio:
                    data.audio || null

            }, ws);

            return;
        }
    }


    /*
    =====================================================
    CLOSE
    =====================================================
    */

    async webSocketClose(ws) {

        this.broadcast({

            type: "users",

            count:
                Math.max(
                    0,
                    this.ctx.getWebSockets().length - 1
                )

        });
    }


    /*
    =====================================================
    ERROR
    =====================================================
    */

    async webSocketError(ws) {

        console.log(
            "WebSocket error"
        );
    }


    /*
    =====================================================
    BROADCAST
    =====================================================
    */

    broadcast(data, except = null) {

        const message =
            JSON.stringify(data);

        for (
            const ws
            of this.ctx.getWebSockets()
        ) {

            if (ws === except)
                continue;

            try {

                ws.send(message);

            } catch (error) {

                try {
                    ws.close();
                } catch {}
            }
        }
    }
}
