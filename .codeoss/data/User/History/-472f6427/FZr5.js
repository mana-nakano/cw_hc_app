const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// ★変更：fs をやめて Firestore を導入
const { Firestore } = require('@google-cloud/firestore');
const db = new Firestore({ databaseId: 'hclog' }); // ★ databaseId を指定

const app = express();

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

// ※ callHistory のグローバル配列と起動時の fs.readFileSync 処理は削除しました。
// 常にFirestoreから最新データをリアルタイムで取得するため不要になります。

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

    // ★変更：履歴リクエストに対して、Firestore から最新100件を取得して返す
    socket.on('get-history', async () => {
        try {
            const snapshot = await db.collection('callHistory')
                                      .orderBy('id', 'desc')
                                      .limit(100)
                                      .get();
            const history = [];
            snapshot.forEach(doc => history.push(doc.data()));
            
            socket.emit('history-data', history);
        } catch (err) {
            console.error("Firestoreからの履歴取得に失敗:", err);
        }
    });

    // ★変更：通話メモ（ログ）を Firestore に保存する
    socket.on('save-call-log', async (logData) => {
        const newLog = {
    id: Date.now(),
    // オプションに { timeZone: 'Asia/Tokyo' } を追加します
    timestamp: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }), 
    ...logData
　　　};

        try {
            // Firestoreの 'callHistory' コレクションに保存
            await db.collection('callHistory').doc(String(newLog.id)).set(newLog);
            console.log(`DBにログを保存しました: ${logData.storeId}店 - 担当: ${logData.staffName}`);

            // 保存後、最新の履歴100件を再取得して全スタッフ（接続中の全員）にリアルタイム通知
            const snapshot = await db.collection('callHistory')
                                      .orderBy('id', 'desc')
                                      .limit(100)
                                      .get();
            const history = [];
            snapshot.forEach(doc => history.push(doc.data()));

            io.emit('history-data', history);
        } catch (err) {
            console.error("Firestoreへの保存に失敗:", err);
        }
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
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});