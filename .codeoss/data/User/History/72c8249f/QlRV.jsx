import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const CenterPage = () => {
    const localVideoRef = useRef();
    const remoteVideoRef = useRef();
    const socketRef = useRef();
    const pcRef = useRef();
    const currentRoomRef = useRef(null);

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const currentLogIdRef = useRef(null); // 通話ごとの一意のログID

    const [waitingRooms, setWaitingRooms] = useState([]);
    const [currentRoom, setCurrentRoom] = useState(null);
    const [status, setStatus] = useState('待機中');
    const [staffName, setStaffName] = useState("");
    const staffNameRef = useRef(""); // ★追加：最新のスタッフ名を保持する
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [allStaff, setAllStaff] = useState([]);
    const [myStatus, setMyStatus] = useState(true);
    const [isSystemOnline, setIsSystemOnline] = useState(false);

    // ★追加：メモと履歴管理用の状態
    const [memoText, setMemoText] = useState(""); // メモ入力用
    const [history, setHistory] = useState([]); // 履歴データ用
    const [activeTab, setActiveTab] = useState('dashboard'); // 画面切り替え用
    const memoTextRef = useRef(""); // ★最新のメモを保持するための Ref

    const handleLogin = () => {
        if (!staffName) return;
        // ★追加：ブラウザのセッションに名前を保存（タブを閉じるまで有効）
        sessionStorage.setItem('staffName', staffName);

        // ★追加：Refに名前を保存（これで後からいつでも取り出せます）
        staffNameRef.current = staffName;

        if (socketRef.current) {
            socketRef.current.emit('staff-login', staffName);
            setIsLoggedIn(true);
        }
    };
    const toggleStatus = () => {
        const newStatus = !myStatus;
        setMyStatus(newStatus);
        if (socketRef.current) {
            socketRef.current.emit('update-staff-status', newStatus);
        }
    };

    // ★追加：録音を開始する関数（相手の音声トラックを狙って録音します）
    const startRecording = (stream) => {
        currentLogIdRef.current = Date.now(); // この通話の固有IDを決定
        audioChunksRef.current = [];

        try {
            // 相手のストリームから音声トラックだけを抽出して録音
            const audioStream = new MediaStream(stream.getAudioTracks());
            const mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const arrayBuffer = await audioBlob.arrayBuffer();
                
                // バックエンドへ録音データをアップロード
                if (socketRef.current && currentLogIdRef.current) {
                    socketRef.current.emit('upload-audio', {
                        logId: currentLogIdRef.current,
                        audioBuffer: arrayBuffer
                    });
                }
            };

            mediaRecorder.start();
            console.log("録音を開始しました");
        } catch (err) {
            console.error("録音の開始に失敗しました:", err);
        }
    };

    // ★追加：録音を停止する関数
    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            console.log("録音を停止しました");
        }
    };

    const endCall = () => {
        stopRecording(); // ★追加：通話終了時に録音を止める
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
        if (localVideoRef.current?.srcObject) {
            localVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
            localVideoRef.current.srcObject = null;
        }
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }
        if (socketRef.current && currentRoom) {
            socketRef.current.emit('leave-room', currentRoom);
        }
        setCurrentRoom(null);
        currentRoomRef.current = null;
        setStatus('待機中');
    };

    // endCall の下あたりに共通関数を定義
    const saveLogAndReset = () => {
        // 1. ログの保存（Refから最新の情報を取得して送信）
        if (socketRef.current && currentRoomRef.current) {
            socketRef.current.emit('save-call-log', {
                storeId: currentRoomRef.current,
                staffName: staffNameRef.current, // ★Refから最新の名前を取得
                memo: memoTextRef.current        // ★Refから最新のメモを取得
            });
        }

        // 2. 通話終了処理（既存の処理を流用）
        endCall();

        // 3. 画面の入力内容などをリセット
        setMemoText("");
        memoTextRef.current = "";
        // currentRoomRef.current = null; // endCall内で実行されるため不要
    };

    // ★追加：メモを保存してから通話を終了する関数
    const handleEndCallWithLog = () => {
        if (socketRef.current && currentRoom) {
            socketRef.current.emit('save-call-log', {
                storeId: currentRoom,
                // ★修正：Ref から名前を取得
                staffName: staffNameRef.current,
                memo: memoTextRef.current
            });
        }
        setMemoText("");
        memoTextRef.current = "";
        endCall();
    };

    useEffect(() => {
        socketRef.current = io();
        
        // ★追加：ページ読み込み時にセッションに名前があれば自動ログイン
        const savedName = sessionStorage.getItem('staffName');
        if (savedName) {
         setStaffName(savedName);
         staffNameRef.current = savedName;
         setIsLoggedIn(true);
        }

        // ★追加：通信が（再）接続された際、セッションに名前があれば自動ログイン通知
        socketRef.current.on('connect', () => {
         const currentSavedName = sessionStorage.getItem('staffName');
         if (currentSavedName) {
          socketRef.current.emit('staff-login', currentSavedName);
          }
        });

        socketRef.current.on('update-staff-list', (list) => {
            setAllStaff(list);
        });

        socketRef.current.on('update-room-list', (rooms) => {
            setWaitingRooms(rooms);
        });

        socketRef.current.on('staff-status-changed', (status) => {
            setIsSystemOnline(status);
        });

        // ★追加：履歴データの受信
        socketRef.current.on('history-data', (data) => {
            setHistory(data);
        });

        // ★追加：初回ログイン時に履歴を取得
        socketRef.current.emit('get-history');

        // CenterPage.jsx の 79行目付近の useEffect 内
        socketRef.current.on('call-ended', () => {
            stopRecording(); // ★追加：相手が切ったときも録音を止める
            console.log("お客様側で通話が終了されました");
            if (currentRoomRef.current) {
                socketRef.current.emit('save-call-log', {
                    id: currentLogIdRef.current || Date.now(), // ★追加
                    storeId: currentRoomRef.current,
                    // ★修正：変数ではなく Ref から名前を取得する
                    staffName: staffNameRef.current,
                    memo: memoTextRef.current
                });
            }
            // クリーンアップ処理（既存のコード）
            if (pcRef.current) {
                pcRef.current.close();
                pcRef.current = null;
            }
            if (localVideoRef.current?.srcObject) {
                localVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
                localVideoRef.current.srcObject = null;
            }
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null;
            }

            // 状態のリセット
            setCurrentRoom(null);
            currentRoomRef.current = null;
            setStatus('待機中');
            setMemoText(""); // ステートを空にする
            memoTextRef.current = ""; // Ref も空にする
        });

        socketRef.current.on('signal', async ({ signal }) => {
            if (!pcRef.current) return;
            if (signal.sdp) {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                if (signal.sdp.type === 'offer') {
                    const answer = await pcRef.current.createAnswer();
                    await pcRef.current.setLocalDescription(answer);
                    socketRef.current.emit('signal', { roomId: currentRoomRef.current, signal: { sdp: answer } });
                }
            } else if (signal.candidate) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
        });

        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    const startCall = async (roomId) => {
        setCurrentRoom(roomId);
        currentRoomRef.current = roomId;
        setStatus(`${roomId}店 に接続中...`);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideoRef.current.srcObject = stream;
            socketRef.current.emit('join-room', roomId);
            pcRef.current = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));
            pcRef.current.ontrack = (event) => {
                remoteVideoRef.current.srcObject = event.streams[0];
                setStatus(`${roomId}店 と通話中！`);
                //録音開始
                startRecording(event.streams[0]);
            };
            pcRef.current.onicecandidate = (event) => {
                if (event.candidate) {
                    socketRef.current.emit('signal', { roomId, signal: { candidate: event.candidate } });
                }
            };
            const offer = await pcRef.current.createOffer();
            await pcRef.current.setLocalDescription(offer);
            socketRef.current.emit('signal', { roomId, signal: { sdp: offer } });
        } catch (err) {
            console.error(err);
            endCall();
        }
    };

    if (!isLoggedIn) {
        return (
            <div className="h-screen bg-slate-900 flex items-center justify-center font-sans">
                <div className="bg-slate-800 p-10 rounded-3xl shadow-2xl w-96">
                    <h2 className="text-2xl font-bold mb-6 text-white text-center">スタッフログイン</h2>
                    <input
                        type="text"
                        placeholder="お名前を入力"
                        className="w-full p-4 bg-slate-700 rounded-xl text-white mb-6 outline-none focus:ring-2 ring-blue-500 text-lg"
                        value={staffName}
                        onChange={(e) => setStaffName(e.target.value)}
                    />
                    <button onClick={handleLogin} className="w-full bg-blue-600 py-4 rounded-xl font-bold text-white">入室する</button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-slate-900 text-white overflow-hidden font-sans">
            <aside className="w-72 bg-slate-800 border-r border-slate-700 p-6 flex flex-col shrink-0">
                {/* ★追加：タブ切り替えスイッチ */}
                <div className="flex gap-2 mb-8 bg-slate-900/50 p-1 rounded-xl">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                        ダッシュボード
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                        対応履歴
                    </button>
                </div>

                {activeTab === 'dashboard' ? (
                    <>
                        <h2 className="text-xl font-bold mb-6 flex items-center">
                            <span className="mr-2 text-2xl">🏠</span> 待機中の店舗
                        </h2>
                        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                            {waitingRooms.length === 0 && (
                                <p className="text-slate-400 text-center py-10 italic text-sm">待機なし</p>
                            )}
                            {waitingRooms.map(roomId => {
                                const handlingStaff = allStaff.find(s => s.target === roomId && s.status === "通話中");
                                const isMeHandling = handlingStaff && handlingStaff.socketId === socketRef.current?.id;
                                const isOtherHandling = handlingStaff && !isMeHandling;
                                return (
                                    <button
                                        key={roomId}
                                        onClick={() => !handlingStaff && startCall(roomId)}
                                        disabled={currentRoom !== null || isOtherHandling || isMeHandling}
                                        className={`w-full p-4 rounded-xl text-left transition-all mb-3 ${isMeHandling ?
                                            'bg-green-600 border-2 border-green-400'
                                            : isOtherHandling ?
                                                'bg-slate-700 opacity-60 cursor-not-allowed'
                                                : currentRoom === null ?
                                                    'bg-blue-600 hover:bg-blue-500 shadow-lg'
                                                    : 'bg-slate-700 opacity-50'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="font-bold text-lg">{roomId}店</div>
                                            {isMeHandling && <span className="text-[10px] bg-white text-green-700 px-2 py-0.5 rounded-full font-black animate-pulse">対応中</span>}
                                            {isOtherHandling && <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold">{handlingStaff.name}対応中</span>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 text-slate-500 text-sm italic py-10 text-center">履歴モード表示中...</div>
                )}

                <div className="mt-10 border-t border-slate-700 pt-6">
                    <h3 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest">スタッフ稼働状況</h3>
                    <div className="space-y-3 overflow-y-auto max-h-60">
                        {allStaff.map((staff) => {
                            // 表示用のラベルと色を判定するロジックを追加
                            let statusLabel = "待機中";
                            let statusClass = "bg-green-500/20 text-green-400";

                            if (!staff.isAvailable) {
                                // 個別スイッチが「離籍中」の場合
                                statusLabel = "離籍中";
                                statusClass = "bg-gray-500/20 text-gray-400";
                            } else if (staff.status === "通話中") {
                                // 通話中の場合
                                statusLabel = `${staff.target}店対応中`;
                                statusClass = "bg-red-500/20 text-red-400";
                            }

                            return (
                                <div key={staff.socketId} className="bg-slate-700/30 p-3 rounded-lg border border-slate-600/50">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="font-bold">
                                            {staff.name} {staff.socketId === socketRef.current?.id && "(自分)"}
                                        </span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statusClass}`}>
                                            {statusLabel}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </aside>

            <main className="flex-1 flex flex-col p-8 overflow-hidden">
                {activeTab === 'dashboard' ? (
                    // --- ダッシュボード画面 ---
                    <>
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h1 className="text-2xl font-bold">コールセンター ダッシュボード</h1>
                                <p className="text-slate-400 mt-1 text-sm">
                                    システム状況:
                                    <span className={`font-bold ml-2 ${isSystemOnline ? 'text-green-400' : 'text-gray-500'}`}>
                                        {isSystemOnline ? '受付中' : '離籍中'}
                                    </span>
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-slate-800 rounded-2xl border border-slate-700">
                                    <span className="font-bold text-sm text-slate-300 mr-4">マイステータス:</span>
                                    <button onClick={toggleStatus} className={`px-6 py-2 rounded-full font-bold transition-all ${myStatus ? 'bg-green-500 text-white' : 'bg-gray-500 text-white'}`}>
                                        {myStatus ? '● 待機中' : '離籍中'}
                                    </button>
                                </div>
                                {/* ★修正：終了ボタンでメモを保存するように変更 */}
                                {currentRoom && <button onClick={handleEndCallWithLog} className="bg-red-500 hover:bg-red-600 px-8 py-3 rounded-2xl font-bold shadow-lg transition-all active:scale-95">🛑 通話終了</button>}
                            </div>
                        </div>
                        <div className="flex-1 flex gap-6 min-h-0">
                            <div className="flex-[2] bg-black rounded-[40px] overflow-hidden relative border border-slate-700 shadow-2xl">
                                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
                                <div className="absolute bottom-6 left-6 bg-black/60 px-5 py-2 rounded-2xl text-sm">
                                    店舗映像: <span className="text-blue-400 font-bold">{currentRoom || '接続待機...'}</span>
                                </div>
                            </div>
                            <div className="flex-1 flex flex-col gap-6">
                                <div className="h-56 bg-black rounded-[30px] overflow-hidden relative border border-slate-700 shadow-xl">
                                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1 bg-slate-800 rounded-[30px] p-6 border border-slate-700 shadow-inner flex flex-col">
                                    <h3 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2">📝 対応メモ</h3>
                                    {/* ★修正：textareaに状態をバインド */}
                                    <textarea
                                        value={memoText}
                                        onChange={(e) => {
                                            setMemoText(e.target.value);
                                            memoTextRef.current = e.target.value; // ★Ref も同時に更新
                                        }}
                                        className="w-full h-full bg-slate-700/30 ... "
                                        placeholder="相談内容、塗料の種類、回答した内容などを入力..."
                                    />
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    // --- 履歴確認画面 ---
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex justify-between items-end mb-8">
                            <h1 className="text-2xl font-bold tracking-tight">対応履歴一覧</h1>
                            <p className="text-slate-500 text-sm">全 {history.length} 件の記録</p>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-4 pr-4">
                            {history.map(log => (
                                <div key={log.id} className="bg-slate-800 border border-slate-700 p-6 rounded-[30px] shadow-lg hover:border-slate-500 transition-all">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-4">
                                            <span className="bg-blue-600 px-4 py-1 rounded-full text-xs font-black tracking-widest">{log.storeId}店</span>
                                            <span className="text-slate-400 text-sm font-medium">{log.timestamp}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-500 text-xs uppercase font-bold tracking-widest">Operator:</span>
                                            <span className="text-slate-300 font-bold">{log.staffName}</span>
                                        </div>
                                    </div>
                                    <div className="bg-slate-900/50 p-5 rounded-2xl text-slate-300 text-sm whitespace-pre-wrap leading-relaxed border border-slate-700/50 italic">
                                        {log.memo || "（メモなし）"}
                                    </div>
                                </div>
                            ))}
                            {history.length === 0 && (
                                <div className="text-center py-40">
                                    <p className="text-slate-500 text-lg italic">対応履歴はまだありません。</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default CenterPage;