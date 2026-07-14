import React, { useState, useEffect, useRef } from 'react';
import { ICONS, STAFF_FAQ } from '../constants';
import { StaffStatus, IncomingCall } from '../types';
import { signalService } from '../services/signalService';
import { GeminiLiveService } from '../services/geminiService';

interface OnlineStore {
  store: string;
  loc: string;
  lastSeen: number;
}

const StaffDashboard: React.FC = () => {
  // --- 状態管理 (State) ---
  const [isLoggedIn, setIsLoggedIn] = useState(false); 
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<StaffStatus>('AVAILABLE');
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCallInfo, setActiveCallInfo] = useState<{store: string, loc: string} | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [transcription, setTranscription] = useState<string>("");
  const [customerFrame, setCustomerFrame] = useState<string | null>(null);
  const [onlineStores, setOnlineStores] = useState<Record<string, OnlineStore>>({});
  const [onlineStaffs, setOnlineStaffs] = useState<Record<string, any>>({});
  const geminiRef = useRef<GeminiLiveService | null>(null);

  // --- ログイン処理 ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (staffId && password === "1234") { 
      setIsLoggedIn(true);
      // ログイン成功を他端末に通知
      signalService.send({ type: 'STAFF_LOGIN', staffId });
    } else {
      alert("IDまたはパスワードが違います");
    }
  };

  // --- 通信・監視処理 (useEffect) ---
  useEffect(() => {
    if (!isLoggedIn) return; // ログイン前は何もしない

    signalService.send({ type: 'STATUS_UPDATE', status: isCalling ? 'BUSY' : status });

    const unsub = signalService.onMessage((event) => {
      // 既存の着信処理
      if (event.type === 'CALL_REQUEST' && status === 'AVAILABLE' && !isCalling) {
        setIncomingCall({
          id: 'call-' + Date.now(),
          storeName: event.storeName,
          deviceLocation: event.deviceLocation,
          timestamp: new Date(),
        });
      } 
      // 他のスタッフがログインした時の処理を追加
      else if (event.type === 'STAFF_LOGIN') {
        setOnlineStaffs(prev => ({ ...prev, [event.staffId]: { lastSeen: Date.now() } }));
      }
      // その他（通話終了やステータス要求など）
      else if (event.type === 'CALL_ENDED') {
        handleEndCall(false);
      }
      // ...（以下、既存の signalService 処理を継続）
    });

    return () => unsub();
  }, [isLoggedIn, status, isCalling]);

  // --- 通話時間カウントなどのタイマー ---
  useEffect(() => {
    let interval: number;
    if (isCalling) {
      interval = window.setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [isCalling]);

  // --- アクション (Accept, End Call) ---
  const handleAccept = async () => { /* ...既存のコード... */ };
  const handleEndCall = (notify = true) => { /* ...既存のコード... */ };
  const formatDuration = (s: number) => { /* ...既存のコード... */ };

  // --- 画面表示 (Render) ---

  // 1. ログインしていない時はログインフォームを出す
  if (!isLoggedIn) {
    return (
      <div className="h-screen bg-[#0f172a] flex items-center justify-center font-sans">
        <form onSubmit={handleLogin} className="bg-[#1e293b] p-10 rounded-[32px] w-full max-w-md border border-slate-800 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="bg-orange-600 p-3 rounded-2xl"><ICONS.Paint className="w-8 h-8 text-white" /></div>
          </div>
          <h2 className="text-2xl font-black text-white mb-8 text-center tracking-tight">スタッフログイン</h2>
          <div className="space-y-4">
            <input 
              type="text" placeholder="スタッフIDを入力" 
              className="w-full bg-slate-900 p-4 rounded-xl border border-slate-700 text-white focus:ring-2 focus:ring-orange-500 outline-none"
              value={staffId} onChange={e => setStaffId(e.target.value)}
            />
            <input 
              type="password" placeholder="パスワードを入力" 
              className="w-full bg-slate-900 p-4 rounded-xl border border-slate-700 text-white focus:ring-2 focus:ring-orange-500 outline-none"
              value={password} onChange={e => setPassword(e.target.value)}
            />
            <button className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-black transition-all shadow-lg active:scale-95">
              勤務を開始する
            </button>
          </div>
        </form>
      </div>
    );
  }

  // 2. ログインした後はメインの管理画面を出す
  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-200 overflow-hidden font-sans">
      <aside className="w-72 bg-[#1e293b] flex flex-col border-r border-slate-800 shadow-2xl">
        <div className="p-8 flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-orange-600 p-2.5 rounded-xl"><ICONS.Paint className="w-7 h-7 text-white" /></div>
            <div><span className="font-black text-xl block">CONSUL ADMIN</span></div>
          </div>
          
          <div className="space-y-8 overflow-y-auto flex-1 pr-2 custom-scrollbar">
            {/* ステータス設定 */}
            <section>
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">自身のステータス</h3>
              <div className={`p-4 rounded-2xl border ${status === 'AVAILABLE' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-slate-800 border-slate-700'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`w-2 h-2 rounded-full ${status === 'AVAILABLE' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                  <span className="text-xs font-bold text-white">{staffId}：{status === 'AVAILABLE' ? 'オンライン' : '離席中'}</span>
                </div>
                <select 
                  value={status} 
                  onChange={(e) => setStatus(e.target.value as StaffStatus)} 
                  className="w-full bg-slate-900 py-2 px-3 rounded-xl border border-slate-700 text-sm text-white outline-none"
                >
                  <option value="AVAILABLE">対応可能</option>
                  <option value="AWAY">離席中</option>
                </select>
              </div>
            </section>

            {/* ★ 待機スタッフ表示セクション ★ */}
            <section className="mt-8">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">待機中のスタッフ</h3>
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 shadow-inner">
                <p className="text-xl font-black text-white">
                  {Object.keys(onlineStaffs).length + 1} 名体制 
                  {/* +1 は自分自身の分 */}
                </p>
                <ul className="text-[11px] text-slate-400 mt-2 space-y-1">
                   <li>・{staffId} (あなた)</li>
                   {Object.keys(onlineStaffs).map(id => <li key={id}>・{id} さん</li>)}
                </ul>
              </div>
            </section>

            {/* 稼働中の店舗 */}
            <section>
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">稼働中の店舗端末</h3>
              {/* ...店舗リストを表示する既存のコード... */}
            </section>
          </div>
        </div>
      </aside>

      {/* メインエリア（通話画面など）は既存のものをそのまま継続 */}
      <main className="flex-1 flex flex-col min-w-0">
         {/* ...既存の header と div (col-span-8 等) ... */}
      </main>
    </div>
  );
};

export default StaffDashboard;