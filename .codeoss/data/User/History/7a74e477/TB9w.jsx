import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';

const StorePage = () => {
    const { storeId } = useParams();
    const localVideoRef = useRef();
    const remoteVideoRef = useRef();
    const socketRef = useRef();
    const pcRef = useRef();
    const thankYouTimerRef = useRef(); // タイマー管理用

    const [status, setStatus] = useState('待機中');
    const [isCallStarted, setIsCallStarted] = useState(false);
    const [isStaffOnline, setIsStaffOnline] = useState(true);
    const [isThankYouVisible, setIsThankYouVisible] = useState(false); // 感謝画面フラグ

    // --- トップ画面へ完全にリセットする関数 ---
    const resetToTop = () => {
        if (thankYouTimerRef.current) clearTimeout(thankYouTimerRef.current);
        setIsThankYouVisible(false);
        setIsCallStarted(false);
        setStatus('待機中');
    };

    // --- 通話を終了して「ありがとうございました」画面を表示する関数 ---
    const cleanupAndShowThanks = () => {
        // 1. WebRTCの接続を閉じる
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
        // 2. 自分のカメラ・マイクを止める
        if (localVideoRef.current?.srcObject) {
            localVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
            localVideoRef.current.srcObject = null;
        }
        // 3. 相手の映像を消す
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }

        // 4. UIを感謝画面に切り替える
        setIsCallStarted(false);
        setIsThankYouVisible(true);

        // 5. 5秒後に自動的にトップに戻るタイマーをセット
        if (thankYouTimerRef.current) clearTimeout(thankYouTimerRef.current);
        thankYouTimerRef.current = setTimeout(() => {
            resetToTop();
        }, 5000);
    };

    // 自分が「相談を終了する」ボタンを押した時
    const endCall = () => {
        if (socketRef.current && isCallStarted) {
            socketRef.current.emit('leave-room', storeId);
        }
        cleanupAndShowThanks();
    };

    const startCall = async () => {
        setIsCallStarted(true);
        setStatus('呼び出し中...');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideoRef.current.srcObject = stream;
            socketRef.current.emit('join-room', storeId);

            pcRef.current = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));

            pcRef.current.ontrack = (event) => {
                remoteVideoRef.current.srcObject = event.streams[0];
                setStatus('通話中');
            };
            pcRef.current.onicecandidate = (event) => {
                if (event.candidate) {
                    socketRef.current.emit('signal', { roomId: storeId, signal: { candidate: event.candidate } });
                }
            };
        } catch (err) {
            console.error(err);
            resetToTop();
        }
    };

    useEffect(() => {
        socketRef.current = io();

        socketRef.current.on('staff-status-changed', (status) => {
            setIsStaffOnline(status);
        });

        // スタッフ側が終了した通知を受け取る
        socketRef.current.on('call-ended', () => {
            cleanupAndShowThanks();
        });

        socketRef.current.on('signal', async ({ signal }) => {
            if (!pcRef.current) return;
            if (signal.sdp) {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                if (signal.sdp.type === 'offer') {
                    const answer = await pcRef.current.createAnswer();
                    await pcRef.current.setLocalDescription(answer);
                    socketRef.current.emit('signal', { roomId: storeId, signal: { sdp: answer } });
                }
            } else if (signal.candidate) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
        });

        return () => {
            if (thankYouTimerRef.current) clearTimeout(thankYouTimerRef.current);
            socketRef.current.disconnect();
        };
    }, [storeId]);

    // --- 1. ありがとうございました画面（終了後） ---
    if (isThankYouVisible) {
        return (
            <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-12 font-sans">
                <div className="bg-white w-full max-w-4xl rounded-[60px] shadow-2xl py-32 px-12 text-center border border-gray-100 flex flex-col items-center">
                    <div className="w-40 h-40 bg-green-50 rounded-full flex items-center justify-center mb-12">
                        <span className="text-8xl">✔</span>
                    </div>
                    <h2 className="text-6xl font-black mb-8 text-slate-900 tracking-tighter">ありがとうございました</h2>
                    <p className="text-2xl text-gray-500 mb-20 font-medium leading-relaxed">
                        ご相談ありがとうございました。<br />
                        またのご利用を心よりお待ちしております。
                    </p>
                    <button
                        onClick={resetToTop}
                        className="w-full max-w-xl bg-slate-800 hover:bg-slate-700 text-white text-3xl font-black py-10 rounded-[30px] shadow-xl transition-all active:scale-95"
                    >
                        トップ画面に戻る
                    </button>
                    <p className="mt-12 text-gray-400 font-bold animate-pulse">
                        あと 5秒 で自動的に画面が戻ります...
                    </p>
                </div>
            </div>
        );
    }

    // --- 2. トップ待機画面（呼び出し前） ---
    if (!isCallStarted) {
        return (
            <div className="min-h-screen bg-[#f8f9fa] flex flex-col font-sans text-slate-800 overflow-hidden">
                <header className="flex justify-between items-center p-8 bg-white border-b shadow-sm">
                    <div className="flex items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-black leading-none tracking-tight text-slate-900">店頭お問い合わせアプリ</h1>
                            <p className="text-[#f26522] text-sm font-bold mt-2 uppercase tracking-widest text-[10px] md:text-sm">Premium Support for your DIY</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <div className={`flex items-center gap-3 px-6 py-2 rounded-full text-lg font-bold border shadow-sm transition-all ${isStaffOnline ? 'bg-green-50 text-green-600 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-300'
                            }`}>
                            <span className={isStaffOnline ? 'animate-pulse text-xl' : 'text-xl'}>●</span>
                            {isStaffOnline ? 'プロ相談員が待機中' : 'ただいま席を外しております'}
                        </div>
                        <p className="text-gray-400 text-xs md:text-sm font-bold tracking-tighter mr-2 uppercase">Reception: 10:00 - 18:00</p>
                    </div>
                </header>

                <main className="flex-1 flex items-center justify-center p-8 md:p-12">
                    <div className="bg-white w-full max-w-4xl rounded-[40px] md:rounded-[60px] shadow-2xl overflow-hidden flex flex-col items-center py-12 md:py-20 px-8 md:px-12 text-center border border-gray-100">
                        <div className="w-24 h-24 md:w-32 md:h-32 bg-orange-50 rounded-full flex items-center justify-center mb-10">
                            <span className="text-5xl md:text-6xl text-[#f26522]">🎨</span>
                        </div>
                        <h2 className="text-3xl md:text-5xl font-black mb-6 tracking-tighter text-slate-900">店頭お問い合わせアプリ</h2>
                        <p className="text-gray-500 text-lg md:text-2xl mb-4 font-medium leading-relaxed">専門スタッフがビデオ通話でご相談を承ります。</p>
                        <p className="text-gray-400 text-sm md:text-lg mb-12 md:mb-16 italic">（{storeId}店 専用端末）</p>

                        <button
                            onClick={startCall}
                            disabled={!isStaffOnline}
                            className={`w-full max-w-2xl text-white text-2xl md:text-3xl font-black py-8 md:py-10 rounded-[20px] md:rounded-[30px] shadow-2xl transition-all ${isStaffOnline ? 'bg-[#f26522] hover:bg-[#d9541a] shadow-orange-200 active:scale-95' : 'bg-slate-200 text-slate-500 cursor-not-allowed shadow-none'
                                }`}
                        >
                            {isStaffOnline ? '専門スタッフを呼び出す' : 'ただいま席を外しております'}
                        </button>

                        <div className="mt-12 md:mt-16 flex items-center justify-center text-gray-400 text-sm md:text-lg font-bold">
                            <span className="flex items-center gap-2">
                                <span className={isStaffOnline ? 'text-green-500' : 'text-slate-300'}>●</span>
                                <span>{isStaffOnline ? 'スタッフ待機中' : 'スタッフ離籍中'}</span>
                            </span>
                        </div>
                    </div>
                </main>

                <footer className="bg-white p-8 md:p-10 border-t flex justify-between items-center px-10 md:px-20">
                    <div className="flex items-center gap-6 shrink-0">
                        <div className="bg-slate-100 p-4 md:p-5 rounded-full text-3xl md:text-4xl shadow-inner text-slate-600">📞</div>
                        <div className="whitespace-nowrap">
                            <p className="text-gray-400 text-[10px] md:text-sm font-bold uppercase tracking-widest mb-1">お電話でも承ります</p>
                            <p className="text-2xl md:text-5xl font-black tracking-tighter text-slate-800">046-278-3029</p>
                        </div>
                    </div>
                    <div className="text-right ml-8 max-w-md hidden md:block text-gray-500 font-medium">
                        「ビデオ通話は少し恥ずかしい...」という方は、<br />
                        <span className="text-[#f26522] font-black underline underline-offset-4 decoration-2 decoration-[#f26522]/30">お電話でも大歓迎です。</span>
                    </div>
                </footer>
            </div>
        );
    }

    // --- 3. 通話中の画面 ---
    return (
        <div className="min-h-screen bg-slate-900 flex flex-col p-6 text-white font-sans overflow-hidden">
            <div className="flex-1 flex flex-col gap-6 max-w-6xl mx-auto w-full h-full justify-center">
                <div className="flex-1 bg-black rounded-[40px] overflow-hidden relative shadow-2xl border border-slate-700">
                    <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
                    {status === '呼び出し中...' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-xl">
                            <div className="text-center">
                                <div className="w-20 h-20 border-8 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-8 shadow-2xl"></div>
                                <p className="text-2xl md:text-4xl font-black italic text-orange-500 animate-pulse tracking-widest">CALLING STAFF...</p>
                                <p className="text-slate-400 mt-4 text-lg">少々お待ちください...</p>
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex items-end gap-6 h-48 md:h-64">
                    <div className="w-64 md:w-80 h-full bg-slate-800 rounded-[30px] overflow-hidden border-4 border-slate-700 shadow-2xl">
                        <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    </div>
                    <button
                        onClick={endCall}
                        className="flex-1 h-24 bg-red-500 hover:bg-red-600 rounded-[30px] font-black text-2xl md:text-3xl shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-4"
                    >
                        🛑 相談を終了する
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StorePage;