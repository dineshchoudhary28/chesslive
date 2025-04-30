const peer = new RTCPeerConnection();
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
    localVideo.srcObject = stream;
    stream.getTracks().forEach(track => peer.addTrack(track, stream));
});

peer.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
};

peer.onicecandidate = e => {
    if (e.candidate) socket.emit('candidate', e.candidate);
};

socket.on('offer', async offer => {
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit('answer', answer);
});

socket.on('answer', answer => {
    peer.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('candidate', candidate => {
    peer.addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on('startGame', async () => {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('offer', offer);
});
