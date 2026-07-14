const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs'); // ★追加：ファイル保存用

const app = express();
const path = require('path');

// ビルドされたフロントエンドのファイルを公開する設定
app.use(express.static(path.join(__dirname, '../dist')));

// どんなURLにアクセスしてもフロントエンド（index.html）を返す設定
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] }
});

// --- グローバル管理変数 ---
let activeRooms = new Set();
let isStaffOnline = false;
let staffMembers = {};
let callHistory = []; // ★追加：履歴データ用

// ★追加：起動時に保存済みデータを読み込む
try {
    if (fs.existsSync('history.json')) {
        callHistory = JSON.parse(fs.readFileSync('history.json', 'utf8'));
    }
} catch (err) {
    console.error("履歴の読み込みに失敗:", err);
    callHistory = [];
}

function updateGlobalStaffStatus() {
    const staffArray = Object.entries(staffMembers).map(([id, data]) => ({
        socketId: id,
        ...data
    }));

    if (staffArray.length === 0) {
        isStaffOnline = false;
    } else {
        const canAcceptCall = staffArray.some(s => s.isAvailable && s.status === "待機中");
        isStaffOnline = canAcceptCall;
    }

    io.emit('staff-status-changed', isStaffOnline);
    io.emit('update-staff-list', staffArray);
}

io.on('connection', (socket) => {
    console.log('接続:', socket.id);

    // 接続時に現在の状態を送信
    socket.emit('staff-status-changed', isStaffOnline);
    const initialStaffList = Object.entries(staffMembers).map(([id, data]) => ({
        socketId: id,
        ...data
    }));
    socket.emit('update-staff-list', initialStaffList);

    // ★追加：履歴リクエストに対応
    socket.on('get-history', () => {
        socket.emit('history-data', callHistory);
    });

    // ★追加：通話メモ（ログ）の保存
    socket.on('save-call-log', (logData) => {
        const newLog = {
            id: Date.now(),
            timestamp: new Date().toLocaleString('ja-JP'),
            ...logData // storeId, staffName, memo が含まれる
        };

        callHistory.unshift(newLog); // 新しいものを先頭に追加

        // ファイルに保存（永続化）
        fs.writeFileSync('history.json', JSON.stringify(callHistory, null, 2));

        // 全スタッフに最新の履歴を通知
        io.emit('history-data', callHistory);
        console.log(`ログを保存しました: ${logData.storeId}店 - 担当: ${logData.staffName}`);
    });

    socket.on('staff-login', (name) => {
        staffMembers[socket.id] = { name: name, status: "待機中", target: null, isAvailable: true };
        updateGlobalStaffStatus();
    });

    socket.on('update-staff-status', (individualStatus) => {
        if (staffMembers[socket.id]) {
            staffMembers[socket.id].isAvailable = individualStatus;
            updateGlobalStaffStatus();
        }
    });

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        if (roomId !== 'center-admin' && !roomId.startsWith('staff-')) {
            activeRooms.add(roomId);
            io.emit('update-room-list', Array.from(activeRooms));
        }

        if (staffMembers[socket.id]) {
            staffMembers[socket.id].status = "通話中";
            staffMembers[socket.id].target = roomId;
            updateGlobalStaffStatus();
        }
    });

    socket.on('leave-room', (roomId) => {
        socket.to(roomId).emit('call-ended');
        Object.keys(staffMembers).forEach(id => {
            if (staffMembers[id].target === roomId) {
                staffMembers[id].status = "待機中";
                staffMembers[id].target = null;
            }
        });

        socket.leave(roomId);
        activeRooms.delete(roomId);
        updateGlobalStaffStatus();
        io.emit('update-room-list', Array.from(activeRooms));
    });

    socket.on('disconnecting', () => {
        socket.rooms.forEach(room => {
            socket.to(room).emit('call-ended');
            if (activeRooms.has(room)) {
                activeRooms.delete(room);
            }
        });
        io.emit('update-room-list', Array.from(activeRooms));
    });

    socket.on('signal', (data) => {
        socket.to(data.roomId).emit('signal', { senderId: socket.id, signal: data.signal });
    });

    socket.on('disconnect', () => {
        if (staffMembers[socket.id]) {
            delete staffMembers[socket.id];
            updateGlobalStaffStatus();
        }
        console.log('切断:', socket.id);
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));