import { gql, useSubscription } from "@urql/vue"
import { rtcJoinMutation, rtcSignalMutation } from "./mutation"
import { MaybeRef, onMounted, onUnmounted, Ref, ref, watch } from "vue"
import mitt from "mitt"
import { useUserStore } from "@/store/user"

export function useRTC(roomId: MaybeRef<string>) {
    const state = ref("loading")
    let client = new RTCClient(typeof roomId === "string" ? roomId : roomId.value, state)
    const voiceOn = ref(true)
    const micOn = ref(false)
    watch(micOn, newVal => client.setMicOn(newVal))
    if (typeof roomId !== "string") {
        watch(roomId, newVal => {
            if (client) client.dispose()
            client = new RTCClient(newVal, state)
        })
    }

    return { state, voiceOn, micOn, client }
}

export class RTCClient {
    clientId = ""
    connMap: Map<string, RTCConnection>
    emitter = mitt<{
        ask: RTCSessionDescriptionInit
        offer: RTCSessionDescriptionInit
        answer: RTCSessionDescriptionInit
        candidate: RTCIceCandidateInit
    }>()
    localStream: MediaStream | null = null
    constructor(
        public roomId: string,
        public state: Ref<string>
    ) {
        state.value = "loading"
        useSubscription<{
            newRoomUser: {
                id: string
                end: boolean
                user: {
                    id: string
                    name: string
                    qq: string
                }
            }
        }>(
            {
                query: gql`
                    subscription ($roomId: String!) {
                        newRoomUser(roomId: $roomId) {
                            id
                            end
                            user {
                                id
                                name
                                qq
                            }
                        }
                    }
                `,
                variables: { roomId },
            },
            (_, data) => {
                const rtc = data.newRoomUser
                if (rtc.id !== this.clientId) {
                    console.log("[rtc] newRtc", data.newRoomUser)
                    if (rtc.end) {
                        this.get(rtc.id)?.close()
                    } else {
                        this.createConnection(rtc.id)
                    }
                }
                return data
            }
        )
        useSubscription<{
            newRtcEvent: { id: string; type: "ask" | "offer" | "answer" | "candidate"; from: string; to: string; body: string }
        }>(
            {
                query: gql`
                    subscription ($roomId: String!) {
                        newRtcEvent(roomId: $roomId) {
                            id
                            type
                            from
                            to
                            body
                        }
                    }
                `,
                variables: { roomId },
            },
            (_, data) => {
                if (!data.newRtcEvent) return data
                const ev = data.newRtcEvent
                if (this.clientId === ev.to) {
                    // console.log("[rtc] newRtcEvent", ev)
                    this.emitter.emit(ev.type, JSON.parse(ev.body))
                }
                return data
            }
        )
        onMounted(async () => {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        channelCount: { ideal: 1 },
                        noiseSuppression: { ideal: true },
                        echoCancellation: { ideal: true },
                        autoGainControl: { ideal: true },
                        sampleRate: { ideal: 48000 },
                    }, // 请求音频访问权限
                })
            } catch {}
            this.setMicOn(false)
            for (let i = 0; i < 10; i++) {
                try {
                    await this.connect()
                    await new Promise(r => setTimeout(r, 200))
                    break
                } catch {}
            }
        })
        onUnmounted(async () => {
            this.dispose()
        })

        this.connMap = new Map()
    }
    get(id: string) {
        return this.connMap.get(id)
    }

    setMicOn(val: boolean) {
        this.localStream?.getAudioTracks().forEach(track => {
            track.enabled = val
        })
    }

    async connect() {
        const rst = await rtcJoinMutation({
            roomId: this.roomId,
        })
        const user = useUserStore()
        if (rst) {
            this.clientId = rst.id
            console.log("[rtc] join success", this.clientId, rst.clients)
            for (const session of rst.clients) {
                if (session.user.id !== user.id) {
                    const conn = this.createConnection(session.id)
                    conn.offer()
                }
            }
            this.state.value = "loaded"
        } else {
            this.state.value = "failed"
            throw new Error("join failed")
        }
    }

    createConnection(from: string) {
        const conn = new RTCConnection(this, from, this.localStream!)
        this.connMap.set(from, conn)
        conn.ondisconnect = () => {
            console.log("[rtc] connection closed", from)
            conn.close()
            this.connMap.delete(from)
        }
        return conn
    }

    dispose() {
        this.connMap.forEach(conn => conn.close())
        this.connMap.clear()
    }
}

class RTCConnection {
    pc!: RTCPeerConnection
    audios: { audio: HTMLAudioElement; stream: MediaStream }[] = []
    ondisconnect = () => {}
    constructor(
        public client: RTCClient,
        public to: string,
        public localStream: MediaStream
    ) {
        client.emitter.on("offer", this.answer)
        client.emitter.on("answer", this.end)
        client.emitter.on("candidate", this.addCandidate)

        this.connect()
    }
    async send(ev: string, data: any) {
        return await rtcSignalMutation({
            roomId: this.client.roomId,
            type: ev,
            from: this.client.clientId,
            to: this.to,
            body: JSON.stringify(data),
        })
    }
    async offer() {
        const offer = await this.pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false,
        })
        await this.pc.setLocalDescription(offer)
        this.send("offer", offer)
    }
    answer = async (desc: RTCSessionDescriptionInit) => {
        await this.pc.setRemoteDescription(desc)
        const answer = await this.pc.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false,
        })
        await this.pc.setLocalDescription(answer)
        this.send("answer", answer)
    }
    end = async (sdp: RTCSessionDescriptionInit) => {
        if (this.pc.signalingState === "stable") {
            await new Promise<void>(resolve => {
                const handler = () => {
                    if (this.pc.signalingState !== "stable") {
                        this.pc.removeEventListener("signalingstatechange", handler)
                        resolve()
                    }
                }
                this.pc.addEventListener("signalingstatechange", handler)
            })
        }
        await this.pc.setRemoteDescription(sdp)
    }
    addCandidate = async (candidate: RTCIceCandidateInit) => {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
    }
    close() {
        this.client.emitter.off("offer", this.answer)
        this.client.emitter.off("answer", this.end)
        this.client.emitter.off("candidate", this.addCandidate)
        this.pc.close()
        this.audios.forEach(({ audio, stream }) => {
            audio.pause()
            audio.srcObject = null
            stream.getTracks().forEach(track => track.stop())
        })
        this.audios = []
    }
    async connect() {
        this.pc = new RTCPeerConnection({
            iceServers: [{ urls: "turn:xn--chq26veyq.icu:3478?transport=tcp", username: "rtc", credential: "rtc" }],
        })
        this.pc.onicecandidate = event => {
            if (event.candidate) this.send("candidate", event.candidate)
        }
        this.pc.ontrack = event => {
            // console.log("[rtc] track")

            const stream = event.streams[0]
            const audio = new Audio()
            this.audios.push({ audio, stream })
            audio.autoplay = true
            audio.srcObject = stream
        }
        this.pc.onconnectionstatechange = () => {
            if (!this.ondisconnect) return
            if (this.pc.connectionState === "disconnected") this.ondisconnect()
        }

        this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream))
    }
}
