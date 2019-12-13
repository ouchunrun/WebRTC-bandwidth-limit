/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

var getMediaButton = document.querySelector('button#getMedia');
var connectButton = document.querySelector('button#connect');
var hangupButton = document.querySelector('button#hangup');

getMediaButton.onclick = getMedia;
connectButton.onclick = createPeerConnection;
hangupButton.onclick = hangup;

var bitrateDiv = document.querySelector('div#bitrate');
var peerDiv = document.querySelector('div#peer');
var senderStatsDiv = document.querySelector('div#senderStats');
var receiverStatsDiv = document.querySelector('div#receiverStats');

var localVideo = document.querySelector('div#localVideo video');
var remoteVideo = document.querySelector('div#remoteVideo video');
var localVideoStatsDiv = document.querySelector('div#localVideo div');
var remoteVideoStatsDiv = document.querySelector('div#remoteVideo div');

var localPeerConnection;
var remotePeerConnection;
var localStream;
var bytesPrev;
var timestampPrev;


var constraints = {
    audio: true,
    video: true

};

/**
 * 是否修改sdp带宽值
 */
function bitrateChoose() {
    let bitrateSet = document.getElementById('bitrateSet')
    let bitrateList = document.getElementById('bitrateEnabled').options
    if(bitrateList && bitrateList.length > 0){
        let select= bitrateList[bitrateList.selectedIndex]
        if(select.value === 'true'){
            console.log('启用带宽设置')
            bitrateSet.style.display = 'block'
        }else {
            console.log('不启用带宽设置')
            bitrateSet.style.display = 'none'
        }
        console.warn("bitrate select: ", select.label)
    }else {
        alert('No device here! plug device and Try again!')
    }
}

// getMedia();

function getMedia() {
    console.warn('GetUserMedia start!');
    getMediaButton.disabled = true;
    if (localStream) {
        localStream.getTracks().forEach(function(track) {
            track.stop();
        });
        var videoTracks = localStream.getVideoTracks();
        for (var i = 0; i !== videoTracks.length; ++i) {
            videoTracks[i].stop();
        }
    }
    navigator.mediaDevices.getUserMedia(constraints)
        .then(gotStream)
        .catch(function(e) {
            console.warn("getUserMedia failed!");
            var message = 'getUserMedia error: ' + e.name + '\n' +
                'PermissionDeniedError may mean invalid constraints.';
            console.warn(message);
            getMediaButton.disabled = false;
        });
}


function gotStream(stream) {
    connectButton.disabled = false;
    console.warn('GetUserMedia succeeded:');
    localStream = stream;
    localVideo.srcObject = stream;
}

function legalCheck() {
    let result = true
    let bitrateList = document.getElementById('bitrateEnabled').options
    let select= bitrateList[bitrateList.selectedIndex]
    if(select.value === 'true'){
        let ASBitrate = document.getElementById('ASBitrate').value
        let TIASBitrate = document.getElementById('TIASBitrate').value

        if(isNaN(ASBitrate.trim())){
            console.warn('ASBitrate is required to be a number')
            result = false
        }

        if(isNaN(TIASBitrate.trim())){
            console.warn('TIASBitrate is required to be a number')
            result = false
        }

        if(ASBitrate.trim().length === 0 && TIASBitrate.trim().length === 0){
            console.warn('至少设置ASBitrate或TIASBitrate')
            result = false
        }

    }
    return result
}

function createPeerConnection() {
    if(!legalCheck()){
        alert('请输入ASBitrate、TIASBitrate并确保为数字')
        return
    }

    console.log("begin create peerConnections");
    connectButton.disabled = true;
    hangupButton.disabled = false;

    bytesPrev = 0;
    timestampPrev = 0;
    localPeerConnection = new RTCPeerConnection(null);
    remotePeerConnection = new RTCPeerConnection(null);
    localStream.getTracks().forEach(
        function(track) {
            console.log("localPeerConnection addTack!");
            localPeerConnection.addTrack(
                track,
                localStream
            );
        }
    );
    console.log('localPeerConnection creating offer');
    localPeerConnection.onnegotiationeeded = function() {
        console.log('Negotiation needed - localPeerConnection');
    };
    remotePeerConnection.onnegotiationeeded = function() {
        console.log('Negotiation needed - remotePeerConnection');
    };
    localPeerConnection.onicecandidate = function(e) {
        console.log('Candidate localPeerConnection');
        remotePeerConnection.addIceCandidate(e.candidate)
            .then(
                onAddIceCandidateSuccess,
                onAddIceCandidateError
            );
    };
    remotePeerConnection.onicecandidate = function(e) {
        console.log('Candidate remotePeerConnection');
        localPeerConnection.addIceCandidate(e.candidate)
            .then(
                onAddIceCandidateSuccess,
                onAddIceCandidateError
            );
    };
    remotePeerConnection.ontrack = function(e) {
        if (remoteVideo.srcObject !== e.streams[0]) {
            console.log('remotePeerConnection got stream');
            remoteVideo.srcObject = e.streams[0];
        }
    };
    localPeerConnection.createOffer().then(
        function(offer) {
            console.log('localPeerConnection offering');

            localPeerConnection.setLocalDescription(offer);

            console.log('start set start bitrate')
            offer.sdp = setStartBitrate(offer.sdp, 'video');
            console.log(`Offer from pc1 ${offer.sdp}`);
            remotePeerConnection.setRemoteDescription(offer);

            remotePeerConnection.createAnswer().then(
                function(answer) {
                    console.log('remotePeerConnection answering');
                    remotePeerConnection.setLocalDescription(answer);
                    console.log('set media bitrate')
                    answer.sdp = setMediaBitrate(answer.sdp);
                    console.log(`Answer from pc2:\n${answer.sdp}`);
                    localPeerConnection.setRemoteDescription(answer);
                },
                function(err) {
                    console.log(err);
                }
            );
        },
        function(err) {
            console.log(err);
        }
    );
}

function onAddIceCandidateSuccess() {
    console.log('AddIceCandidate success.');
}

function onAddIceCandidateError(error) {
    console.log('Failed to add Ice Candidate: ' + error.toString());
}


function hangup() {
    console.log('Ending call');
    localPeerConnection.close();
    remotePeerConnection.close();
    window.location.reload();

    // query stats one last time.
    Promise.all([
        remotePeerConnection.getStats(null)
            .then(showRemoteStats, function(err) {
                console.log(err);
            }),
        localPeerConnection.getStats(null)
            .then(showLocalStats, function(err) {
                console.log(err);
            })
    ]).then(() => {
        localPeerConnection = null;
        remotePeerConnection = null;
    });

    localStream.getTracks().forEach(function(track) {
        track.stop();
    });
    localStream = null;

    hangupButton.disabled = true;
    getMediaButton.disabled = false;
}

function showRemoteStats(results) {
    var statsString = dumpStats(results);

    receiverStatsDiv.innerHTML = '<h2>Receiver stats</h2>' + statsString;
    // calculate video bitrate
    results.forEach(function(report) {
        var now = report.timestamp;

        var bitrate;
        if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
            var bytes = report.bytesReceived;
            if (timestampPrev) {
                bitrate = 8 * (bytes - bytesPrev) / (now - timestampPrev);
                bitrate = Math.floor(bitrate);
            }
            bytesPrev = bytes;
            timestampPrev = now;
        }
        if (bitrate) {
            bitrate += ' kbits/sec';
            bitrateDiv.innerHTML = '<strong>Bitrate:</strong> ' + bitrate;
        }
    });

    // figure out the peer's ip
    var activeCandidatePair = null;
    var remoteCandidate = null;

    // Search for the candidate pair, spec-way first.
    results.forEach(function(report) {
        if (report.type === 'transport') {
            activeCandidatePair = results.get(report.selectedCandidatePairId);
        }
    });
    // Fallback for Firefox and Chrome legacy stats.
    if (!activeCandidatePair) {
        results.forEach(function(report) {
            if (report.type === 'candidate-pair' && report.selected ||
                report.type === 'googCandidatePair' &&
                report.googActiveConnection === 'true') {
                activeCandidatePair = report;
            }
        });
    }
    if (activeCandidatePair && activeCandidatePair.remoteCandidateId) {
        remoteCandidate = results.get(activeCandidatePair.remoteCandidateId);
    }
    if (remoteCandidate) {
        if (remoteCandidate.ip && remoteCandidate.port) {
            peerDiv.innerHTML = '<strong>Connected to:</strong> ' +
                remoteCandidate.ip + ':' + remoteCandidate.port;
        } else if (remoteCandidate.ipAddress && remoteCandidate.portNumber) {
            // Fall back to old names.
            peerDiv.innerHTML = '<strong>Connected to:</strong> ' +
                remoteCandidate.ipAddress +
                ':' + remoteCandidate.portNumber;
        }
    }
}

function showLocalStats(results) {
    var statsString = dumpStats(results);
    senderStatsDiv.innerHTML = '<h2>Sender stats</h2>' + statsString;
}
// Display statistics
setInterval(function() {
    if (localPeerConnection && remotePeerConnection) {
        remotePeerConnection.getStats(null)
            .then(showRemoteStats, function(err) {
                console.log(err);
            });
        localPeerConnection.getStats(null)
            .then(showLocalStats, function(err) {
                console.log(err);
            });
    } else {
        console.log('Not connected yet');
    }
    // Collect some stats from the video tags.
    if (localVideo.videoWidth) {
        localVideoStatsDiv.innerHTML = '<strong>Video dimensions:</strong> ' +
            localVideo.videoWidth + 'x' + localVideo.videoHeight + 'px';
    }
    if (remoteVideo.videoWidth) {
        remoteVideoStatsDiv.innerHTML = '<strong>Video dimensions:</strong> ' +
            remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight + 'px';
    }
}, 1000);

// Dumping a stats variable as a string.
// might be named toString?
function dumpStats(results) {
    var statsString = '';
    results.forEach(function(res) {
        statsString += '<h3>Report type=';
        statsString += res.type;
        statsString += '</h3>\n';
        statsString += 'id ' + res.id + '<br>\n';
        statsString += 'time ' + res.timestamp + '<br>\n';
        Object.keys(res).forEach(function(k) {
            if (k !== 'timestamp' && k !== 'type' && k !== 'id') {
                statsString += k + ': ' + res[k] + '<br>\n';
            }
        });
    });
    return statsString;
}
