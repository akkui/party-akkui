const callbacks = new Map();
const socket = new WebSocket("ws://localhost:3000/websocket/");
var room_id = "";
var player;

function sendData(type, object) {
    return new Promise((resolve) => {
        const id = Date.now();
        socket.send(JSON.stringify({ id: id, type: type, data: object }));
        callbacks.set(id, (data) => { callbacks.delete(id); resolve(data); });
    });
};

socket.onmessage = function (event) {
    const content = JSON.parse(event.data);
    console.log(content)
    if (!content.function) {
        const getCallback = callbacks.get(content.id);
        if (getCallback) getCallback(content);
    } else {
        if (content.function === "nowPlaying") { player.stopVideo(); player.loadVideoById({ videoId: content.playing.url, startSeconds: content.playing.time }); }
        if (content.function === "queueUpdate") updateQueue(content.queue);
        if (content.function === "skipVideo") player.seekTo(content.time);
    };
};

function updateQueue(new_queue) {
    console.log(new_queue);
}

function displayMessage(color, message, time) {
    document.getElementById('msg').style.color = color;
    document.getElementById('msg').innerHTML = message;
    setTimeout(function () { document.getElementById('msg').innerHTML = ""; }, time || 5000);
}

function onYouTubeIframeAPIReady() {
    player = new YT.Player("player", {
        height: "260", width: "600", events: {
            onReady: function () {
                document.getElementById("join_room").addEventListener("click", function () {
                    sendData("joinRoom", { room_id: document.getElementById("room_id").value }).then(callback => {
                        if (callback.status === 400) return displayMessage('red', callback.reason);
                        room_id = document.getElementById("room_id").value;
                        document.getElementById("home_page").style.display = "none";
                        document.getElementById("player_page").style.display = "block";
                        const video_cache = { url: "1SLr62VBBjw", time: 0 };
                        if (callback.room_status.playing.url !== "") { video_cache.url = callback.room_status.playing.url; video_cache.time = callback.room_status.playing.time }
                        player.loadVideoById({ videoId: video_cache.url, startSeconds: video_cache.time });
                    })
                });

                document.getElementById("video_add").addEventListener("click", function () {
                    sendData('addVideo', { room_id: room_id, url: document.getElementById("video_url").value }).then(callback => {
                        return displayMessage(callback.color, callback.message);
                    })
                });
            },
            onStateChange: function (event) {
                if (event.data === 0) player.loadVideoById({ videoId: "1SLr62VBBjw", startSeconds: 0 });
            },
        },
    });
}

function room_settings() {
    document.getElementById("create_room_button").addEventListener("click", function () {
        sendData("createRoom", { room_id: document.getElementById("create_room_id").value }).then(callback => {
            if (callback.status === 400) return displayMessage('red', callback.reason);
            room_id = (document.getElementById("create_room_id").value).replaceAll(" ", "");
            document.getElementById("home_page").style.display = "none";
            document.getElementById("player_page").style.display = "block";
            player.loadVideoById({ videoId: "1SLr62VBBjw", startSeconds: 0 });
        });
    });

    document.getElementById("video_skip").addEventListener("click", function() {
        sendData("skipVideo", { room_id: room_id }).then(callback => {
            return displayMessage(callback.color, callback.message);
        });
    });

    document.getElementById("video_remove").addEventListener("click", function () {
        sendData("removeVideo", { room_id: room_id, url: document.getElementById("video_url").value }).then(callback => {
            return displayMessage(callback.color, callback.message);
        });
    })
};
room_settings();