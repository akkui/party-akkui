const compression = require("compression");
const bodyparser = require("body-parser");
const XMLHttpRequest = require("xhr2");
const express = require("express");
const cors = require("cors");
const ws = require("ws");

const wss = new ws.Server({ noServer: true });
const app = express();

app.use(compression(), cors(), bodyparser.json({ limit: '1150kb' }), bodyparser.urlencoded({ limit: '1150kb', extended: false }), express.static('public', { type: ['text/css', 'text/javascript'] }));

const database = { global: { playing: { url: "", duration: 0, time: 0 }, queue: [], users: [], moderators: [] } };

function logger() {
    setTimeout(function () {
        try {
            console.log(database["testee"].playing, database["testee"].queue);
            logger();
        } catch (err) {
            logger();
        }
    }, 500)
}
logger();

function getVideoInformations(url, callback_function) {
    let extract_url = "";
    try{extract_url=url.match(/(?<=watch\?v=)[\w-]+/)[0];}catch(err){return callback_function({exists:false,duration:0,url:""})}

    var getJSON = function (url, callback) {
        var xhr = new XMLHttpRequest(); xhr.open("GET", url, true); xhr.responseType = "json";
        xhr.onload = function () { var status = xhr.status; if (status === 200) { callback(null, xhr.response); } else { callback(status, xhr.response); } };
        xhr.send();
    };
    getJSON(`https://www.googleapis.com/youtube/v3/videos?id=${extract_url}&part=contentDetails&key=${process.env.youtubeAPI}`,
        async function (err, data) {
            try {
                function convertVideoDuration(time) {
                    const regex = /PT((\d+)H)?((\d+)M)?((\d+)S)?/; const match = time.match(regex);
                    return parseInt(match[2] || 0) * 3600 + parseInt(match[4] || 0) * 60 + parseInt(match[6] || 0);
                }
                return callback_function({ exists: true, duration: convertVideoDuration(data.items[0].contentDetails.duration), url: extract_url });
            } catch (err) { return callback_function({ exists: false, duration: 0, url: "" }); }
        }
    );
}

function addVideoToQueue(room, video_data) {
    function playVideo(url, duration) {
        database[room].playing = { url: url, duration: duration, time: 0 };
        for (user of database[room].users) user.send(JSON.stringify({ function: 'nowPlaying', playing: database[room].playing }));
        function countTime() {
            setTimeout(function () {
                database[room].playing.time++;
                if (database[room].playing.time === database[room].playing.duration) {
                    if (!database[room].queue[0]) { database[room].playing = { url: "", duration: 0, time: 0 }; } else {
                        playVideo(database[room].queue[0].url, database[room].queue[0].duration);
                        database[room].queue.shift();
                    }
                } else countTime();
            }, 1000)
        }
        countTime();
    }

    if (database[room].playing.url !== "") {
        database[room].queue.push({ url: video_data.url, duration: video_data.duration });
        for (user of database[room].users) user.send(JSON.stringify({ function: 'queueUpdate', queue: database[room].queue })); return;
    };
    return playVideo(video_data.url, video_data.duration);
};

function onConnect(ws) {
    ws.on('message', function (content) {
        try {
            content = JSON.parse(content.toString());
            if (content.type === "joinRoom") {
                const getRoom = database[content.data.room_id];
                if (!getRoom) return ws.send(JSON.stringify({ status: 400, id: content.id, reason: 'Essa sala não existe.' }));
                getRoom.users.push(ws);
                return ws.send(JSON.stringify({ status: 200, id: content.id, room_status: { playing: getRoom.playing, queue: getRoom.queue } }));
            };

            if (content.type === "addVideo") {
                const getRoom = database[content.data.room_id];
                if (!getRoom) return ws.send(JSON.stringify({ status: 400 }));
                getVideoInformations(content.data.url, function (data) {
                    if (data.exists === false) return ws.send(JSON.stringify({ status: 400, id: content.id, color: 'red', message: 'Não foi possivel encontrar o vídeo no URL informado.' }))
                    addVideoToQueue(content.data.room_id, { url: data.url, duration: data.duration });
                    return ws.send(JSON.stringify({ status: 200, id: content.id, color: 'green', message: 'O vídeo foi adicionado com sucesso.' }))
                });
            };

            if (content.type === "createRoom") {
                let getName = content.data.room_id;
                getName = getName.replaceAll(" ", "");
                if (getName.length < 6) return ws.send(JSON.stringify({ status: 400, id: content.id, reason: 'O nome da sala necessita possuir mais do que 6 caracteres.' }));
                if (database[getName]) return ws.send(JSON.stringify({ status: 400, id: content.id, reason: 'Já existe uma sala com esse ID.' }));
                database[getName] = { playing: { url: "", duration: 0, time: 0 }, queue: [], users: [ws], moderators: [ws] };
                return ws.send(JSON.stringify({ status: 200, id: content.id }));
            }

            if (content.type === "skipVideo") {
                const getRoom = database[content.data.room_id];
                if (!getRoom) return ws.send(JSON.stringify({ status: 400 }));
                if (!getRoom.moderators.includes(ws)) return ws.send(JSON.stringify({ status: 400, id: content.id, color: 'red', message: 'Você não tem permissão para pular o vídeo.' }));
                if (getRoom.playing.url === "") return ws.send(JSON.stringify({ status: 400, id: content.id, color: 'red', message: 'Não tem nenhum vídeo sendo reproduzido.' }));
                getRoom.playing.time = getRoom.playing.duration - 1;
                for (user of getRoom.users) user.send(JSON.stringify({ function: 'skipVideo', time: getRoom.playing.duration }))
            }

            if (content.type === "removeVideo") {
                let extract_url;
                const getRoom = database[content.data.room_id];
                if (!getRoom) return ws.send(JSON.stringify({ status: 400 }));
                if (!getRoom.moderators.includes(ws)) return ws.send(JSON.stringify({ status: 400, id: content.id, color: 'red', message: 'Você não tem permissão para remover o vídeo.' }));
                try { extract_url = (content.data.url).match(/(?<=watch\?v=)[\w-]+/)[0]; } catch (err) { return ws.send(JSON.stringify({ status: 400, id: content.id, color: 'red', message: 'Não foi possivel encontrar o vídeo no URL informado.' })) }
                if (getRoom.queue.findIndex((obj) => obj.url === extract_url) < 0) return ws.send(JSON.stringify({ status: 400, id: content.id, color: 'red', message: 'Não foi possivel encontrar o vídeo no URL informado.' }))
                getRoom.queue.splice(getRoom.queue.findIndex((obj) => obj.url === extract_url), 1);
                ws.send(JSON.stringify({ status: 200, id: content.id, color: 'green', message: 'O vídeo foi removido com sucesso.' }))
                for (user of getRoom.users) user.send(JSON.stringify({ function: 'queueUpdate', queue: getRoom.queue }));
            }
        } catch (err) {
            return ws.send(JSON.stringify({ status: 400, reason: 'Formato de Request inválido.' }));
        }
    });
}

app.get('/websocket', (req, res) => {
    if (!req.headers.upgrade || req.headers.upgrade.toLowerCase() != 'websocket') { res.end(); return; }
    if (!req.headers.connection.match(/\bupgrade\b/i)) { res.end(); return; }
    wss.handleUpgrade(req, req.socket, Buffer.alloc(0), onConnect);
});

app.listen(3000, function (err) { console.log('Started') });