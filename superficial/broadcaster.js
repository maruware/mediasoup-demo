const https = require('https')
const axios = require('axios')
const gstreamer = require('gstreamer-superficial');
const {v4} = require('uuid')
const argv = require('optimist').argv

const AUDIO_SSRC = 1111
const AUDIO_PT = 100
const VIDEO_SSRC = 2222
const VIDEO_PT = 101

async function join(serverUrl, roomId, mediaFile) {
    const broadcasterId = v4()
    const client = axios.create({
        baseURL: serverUrl,
        httpsAgent: new https.Agent({  
            rejectUnauthorized: false
        }),
        timeout: 1000
    });

    console.log(`>>> verifying that room '${roomId}' exists...`)
    await client.get(`/rooms/${roomId}`)

    console.log(">>> creating Broadcaster...")
    await client.post(`/rooms/${roomId}/broadcasters`, {
        id: broadcasterId,
        displayName: "Broadcaster",
        device: {name: "superficial"}
    })

    console.log(">>> audio transport")
    let res = await client.post(`/rooms/${roomId}/broadcasters/${broadcasterId}/transports`, {
        type: 'plain',
        comedia: true
    })

    const audioTransportId = res.data.id
    const audioTransportIp = res.data.ip
    const audioTransportPort = res.data.port

    console.log(">>> video transport")
    res = await client.post(`/rooms/${roomId}/broadcasters/${broadcasterId}/transports`, {
        type: 'plain',
        comedia: true
    })

    const videoTransportId = res.data.id
    const videoTransportIp = res.data.ip
    const videoTransportPort = res.data.port

    console.log(">>> audio producer")
    try {
        await client.post(`/rooms/${roomId}/broadcasters/${broadcasterId}/transports/${audioTransportId}/producers`, {
            kind: 'audio',
            rtpParameters: {
                codecs: [{
                    mimeType: 'audio/opus',
                    payloadType: AUDIO_PT,
                    clockRate: 48000,
                    channels: 2,
                    parameters: { 'sprop-stereo': 1 },
                }],
                encodings: [{ ssrc: AUDIO_SSRC }]
            }
        })
    } catch(err) {
        console.error(err)
        throw err
    }

    console.log(">>> video producer")
    await client.post(`/rooms/${roomId}/broadcasters/${broadcasterId}/transports/${videoTransportId}/producers`, {
        kind: 'video',
        rtpParameters: {
            codecs: [{
                mimeType: 'video/vp8',
                payloadType: VIDEO_PT,
                clockRate: 90000
            }],
            encodings: [{ ssrc: VIDEO_SSRC }]
        }
    })

    console.log(">>> produce")
    produce(mediaFile, videoTransportIp, videoTransportPort, audioTransportIp, audioTransportPort)

    setInterval(() => {
    }, 1000)
}

function produce(media, videoTransportIp, videoTransportPort, audioTransportIp, audioTransportPort) {
    const cmd = [
        `filesrc location=${media}`,
	    '! qtdemux name=demux',
	    'demux.video_0',
        '! queue',
        '! decodebin',
        '! videoconvert',
        '! vp8enc target-bitrate=1000000 deadline=1 cpu-used=4',
        `! rtpvp8pay pt=${VIDEO_PT} ssrc=${VIDEO_SSRC} picture-id-mode=2`,
        `! udpsink host=${videoTransportIp} port=${videoTransportPort}`,
        'demux.audio_0',
        '! queue',
        '! decodebin',
        '! audioconvert',
        '! opusenc',
        `! rtpopuspay pt=${AUDIO_PT} ssrc=${AUDIO_SSRC}`,
        `! udpsink host=${audioTransportIp} port=${audioTransportPort}`
    ].join(' ')
    const pipeline = new gstreamer.Pipeline(cmd);
    
    pipeline.play();
}

join(argv.server, argv.room, argv.media)