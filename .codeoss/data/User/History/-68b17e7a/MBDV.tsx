import React, { useState, useEffect } from 'react';
import { ICONS, STAFF_FAQ } from '../constants'; // STAFF_FAQは後でFirestore化
import { StaffStatus, IncomingCall } from '../types';
import { signalService } from '../services/signalService';

const StaffDashboard: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false); 
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<StaffStatus>('AVAILABLE');
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [onlineStaffs, setOnlineStaffs] = useState<Record<string, any>>({});

  // ログイン処理
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (staffId && password === "1234") { 
      setIsLoggedIn(true);
      signalService.send({ type: 'STAFF_LOGIN', staffId });
    } else {
      alert("IDまたはパスワードが違います");
    }
  };

  // 通信監視
  useEffect(() => {
    if (!isLoggedIn) return;

    signalService.send({ type: 'STATUS_UPDATE', status: isCalling ? 'BUSY' : status });

    const unsub = signalService.onMessage((event) => {
      if (event.type === 'CALL_REQUEST' && status === 'AVAILABLE' && !isCalling) {
        setIncomingCall({
          id: 'call-' + Date.now(),
          storeName: event.storeName,
          deviceLocation: event.deviceLocation,
          timestamp: new Date(),
        });
        // 着信音を鳴らすなどの処理をここに追加可能
      } else if (event.type === 'STAFF_LOGIN') {
        setOnlineStaffs(prev => ({ ...prev, [event.staffId]: { lastSeen: Date.now() } }));
      } else if (event.type === 'CALL_ENDED') {
        setIsCalling(false);
        setIncomingCall(null);
      }
    });

    return () => unsub();
  }, [isLoggedIn, status, isCalling]);

  // タイマー
  useEffect(() => {
    let interval: number;
    if (isCalling) {
      interval = window.setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [isCalling]);

  const handleAccept = () => {
    setIsCalling(true);
    setIncomingCall(null);
    signalService.send({ type: 'CALL_ACCEPTED', staffId });
  };

  const handleEndCall = () => {
    setIsCalling(false);
    signalService.send({ type: 'CALL_ENDED' });
  };

  const formatDuration = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  if (!isLoggedIn) {
    return (
      <div className="h-screen bg-[#0f172a] flex items-center justify-center">
        <form onSubmit={handleLogin} className="bg-[#1e293b] p-10 rounded-[32px] w-full max-w-md border border-slate-800 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="bg-orange-600 p-3 rounded-2xl"><ICONS.Paint className="w-8 h-8 text-white" /></div>
          </div>
          <h2 className="text-2xl font-black text-white mb-8 text-center">スタッフログイン</h2>
          <input 
            type="text" placeholder="スタッフID" 
            className="w-full bg-slate-900 p-4 rounded-xl border border-slate-700 text-white mb-4"
            value={staffId} onChange={e => setStaffId(e.target.value)}
          />
          <input 
            type="password" placeholder="パスワード" 
            className="w-full bg-slate-900 p-4 rounded-xl border border-slate-700 text-white mb-6"
            value={password} onChange={e => setPassword(e.target.value)}
          />
          <button className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-black">
            勤務を開始する
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-200 font-sans">
      {/* サイドバー */}
      <aside className="w-72 bg-[#1e293b] flex flex-col border-r border-slate-800">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-orange-600 p-2.5 rounded-xl"><ICONS.Paint className="w-7 h-7 text-white" /></div>
            <span className="font-black text-xl">CONSUL ADMIN</span>
          </div>
          
          <div className="space-y-8">
            <section>
              <h3 className="text-[10px] font-black text-slate-500 uppercase mb-4">ステータス</h3>
              <div className="p-4 bg-slate-800 rounded-2xl border border-slate-700">
                <div className="text-xs font-bold mb-3">{staffId}：オンライン</div>
                <select 
                  value={status} 
                  onChange={(e) => setStatus(e.target.value as StaffStatus)} 
                  className="w-full bg-slate-900 py-2 px-2 rounded-lg text-sm"
                >
                  <option value="AVAILABLE">対応可能</option>
                  <option value="AWAY">離席中</option>
                </select>
              </div>
            </section>

            <section>
              <h3 className="text-[10px] font-black text-slate-500 uppercase mb-4">待機スタッフ</h3>
              <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                <p className="text-xl font-black text-emerald-400">{Object.keys(onlineStaffs).length + 1}名体制</p>
                <p className="text-[10px] mt-1 text-slate-400">あなた / {Object.keys(onlineStaffs).join(', ')}</p>
              </div>
            </section>
          </div>
        </div>
      </aside>

      {/* メインエリア */}
      <main className="flex-1 flex flex-col p-8 overflow-y-auto">
        {/* 着信時のみ表示 */}
        {incomingCall && (
          <div className="bg-orange-600 p-8 rounded-[32px] flex items-center justify-between animate-bounce shadow-2xl mb-8">
            <div>
              <h2 className="text-3xl font-black text-white">【着信】{incomingCall.storeName}</h2>
              <p className="text-orange-100">{incomingCall.deviceLocation}から呼び出し中...</p>
            </div>
            <button 
              onClick={handleAccept}
              className="bg-white text-orange-600 px-10 py-4 rounded-2xl font-black text-xl hover:bg-orange-50"
            >
              応答する
            </button>
          </div>
        )}

        {/* 通話中表示 */}
        {isCalling ? (
          <div className="flex-1 flex flex-col gap-6">
            <div className="bg-slate-800 p-8 rounded-[32px] border border-slate-700 flex justify-between items-center">
              <div>
                <span className="text-slate-400 text-sm">通話中</span>
                <div className="text-4xl font-black text-white">{formatDuration(callDuration)}</div>
              </div>
              <button onClick={handleEndCall} className="bg-red-500 hover:bg-red-600 px-8 py-3 rounded-xl font-bold">
                通話を終了する
              </button>
            </div>
            {/* 今後ここに「AI議事録」が表示されるスペースを確保 */}
            <div className="flex-1 bg-slate-900/50 rounded-[32px] border border-dashed border-slate-700 flex items-center justify-center text-slate-500">
              通話終了後にここにAI要約が表示されます（開発中）
            </div>
          </div>
        ) : (
          /* 通常時：Q&Aリストを表示 */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="col-span-full">
              <h2 className="text-2xl font-black mb-4">塗装Q&A（スタッフ用マニュアル）</h2>
            </div>
            {STAFF_FAQ.map((faq, i) => (
              <div key={i} className="bg-[#1e293b] p-6 rounded-2xl border border-slate-800">
                <div className="text-orange-500 font-bold text-sm mb-2">Q. {faq.question}</div>
                <div className="text-slate-300 text-sm leading-relaxed">A. {faq.answer}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default StaffDashboard;