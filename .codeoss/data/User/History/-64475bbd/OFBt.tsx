const StaffDashboard: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false); // ログイン状態
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  
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
  const [status, setStatus] = useState<StaffStatus>('AVAILABLE');
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCallInfo, setActiveCallInfo] = useState<{store: string, loc: string} | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [transcription, setTranscription] = useState<string>("");
  const [customerFrame, setCustomerFrame] = useState<string | null>(null);
  const [onlineStores, setOnlineStores] = useState<Record<string, OnlineStore>>({});
  const geminiRef = useRef<GeminiLiveService | null>(null);

  useEffect(() => {
    signalService.send({ type: 'STATUS_UPDATE', status: isCalling ? 'BUSY' : status });
  }, [status, isCalling]);

  useEffect(() => {
    const unsub = signalService.onMessage((event) => {
      if (event.type === 'CALL_REQUEST' && status === 'AVAILABLE' && !isCalling) {
        setIncomingCall({
          id: 'call-' + Date.now(),
          storeName: event.storeName,
          deviceLocation: event.deviceLocation,
          timestamp: new Date(),
        });
      } else if (event.type === 'CALL_ENDED') {
        handleEndCall(false);
      } else if (event.type === 'AUDIO_DATA' && isCalling) {
        geminiRef.current?.playExternalAudio(event.data);
      } else if (event.type === 'VIDEO_FRAME' && isCalling) {
        setCustomerFrame(`data:image/jpeg;base64,${event.data}`);
      } else if (event.type === 'STATUS_REQUEST') {
        signalService.send({ type: 'STATUS_UPDATE', status: isCalling ? 'BUSY' : status });
      } else if (event.type === 'STATUS_UPDATE' && event.storeInfo) {
        // 店頭端末からのHeartbeatを受信
        setOnlineStores(prev => ({
          ...prev,
          [event.storeInfo!.store]: {
            ...event.storeInfo!,
            lastSeen: Date.now()
          }
        }));
      }
    });

    // 初期起動時に各店舗の状況を確認
    signalService.send({ type: 'STATUS_REQUEST' });

    // オフライン判定（10秒以上信号がない店舗を削除）
    const cleanup = setInterval(() => {
      setOnlineStores(prev => {
        const next = { ...prev };
        const now = Date.now();
        let changed = false;
        Object.keys(next).forEach(key => {
          if (now - next[key].lastSeen > 10000) {
            delete next[key];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 5000);

    return () => {
      unsub();
      clearInterval(cleanup);
    };
  }, [status, isCalling]);

  useEffect(() => {
    let interval: number;
    if (isCalling) {
      interval = window.setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [isCalling]);

  const handleAccept = async () => {
    if (!incomingCall) return;
    
    setActiveCallInfo({
      store: incomingCall.storeName,
      loc: incomingCall.deviceLocation
    });
    
    setIsCalling(true);
    setIncomingCall(null);
    
    try {
      const gemini = new GeminiLiveService();
      geminiRef.current = gemini;
      await gemini.connect({
        mode: 'staff',
        onLocalAudio: (base64) => {
          signalService.send({ type: 'AUDIO_DATA', data: base64 });
        },
        onMessage: (text) => setTranscription(prev => (prev + " " + text).slice(-300)),
        onError: (e) => console.error(e),
        onClose: () => setIsCalling(false),
      });
      signalService.send({ type: 'CALL_ACCEPTED' });
    } catch (e) {
      console.error(e);
      setIsCalling(false);
    }
  };

  const handleEndCall = (notify = true) => {
    if (geminiRef.current) geminiRef.current.disconnect();
    if (notify) signalService.send({ type: 'CALL_ENDED' });
    setIsCalling(false);
    setTranscription("");
    setCustomerFrame(null);
    setActiveCallInfo(null);
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-200 overflow-hidden font-sans">
      <aside className="w-72 bg-[#1e293b] flex flex-col border-r border-slate-800 shadow-2xl">
        <div className="p-8 flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-orange-600 p-2.5 rounded-xl"><ICONS.Paint className="w-7 h-7 text-white" /></div>
            <div><span className="font-black text-xl block">CONSUL ADMIN</span></div>
          </div>
          
          <div className="space-y-8 overflow-y-auto flex-1 pr-2 custom-scrollbar">
            <section>
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">自身のステータス</h3>
              <div className={`p-4 rounded-2xl border ${status === 'AVAILABLE' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-slate-800 border-slate-700'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`w-2 h-2 rounded-full ${status === 'AVAILABLE' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                  <span className="text-xs font-bold">{status === 'AVAILABLE' ? 'オンライン' : '離席中'}</span>
                </div>
                <select 
                  value={status} 
                  onChange={(e) => setStatus(e.target.value as StaffStatus)} 
                  className="w-full bg-slate-900 py-2 px-3 rounded-xl border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all text-white"
                >
                  <option value="AVAILABLE">対応可能</option>
                  <option value="AWAY">離席中</option>
                </select>
              </div>
            </section>

            <section>
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">稼働中の店舗端末</h3>
              <div className="space-y-2">
                 {Object.values(onlineStores).length === 0 ? (
                   <p className="text-[11px] text-slate-600 italic">オンラインの店舗はありません</p>
                 ) : (
                   Object.values(onlineStores).map(s => (
                     <div key={s.store} className="bg-slate-900/40 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                        <div className="min-w-0">
                           <p className="text-xs font-black truncate">{s.store}</p>
                           <p className="text-[10px] text-slate-500 truncate">{s.loc}</p>
                        </div>
                     </div>
                   ))
                 )}
              </div>
            </section>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-20 border-b border-slate-800 flex items-center justify-between px-10 bg-slate-900/50 backdrop-blur-sm shrink-0">
          <h2 className="text-xl font-black flex items-center gap-4">
             {isCalling ? (
               <div className="flex items-center gap-4">
                 <span className="flex items-center gap-2 text-red-500">
                   <span className="w-3 h-3 bg-red-500 rounded-full animate-ping" /> 通話中
                 </span>
                 <span className="text-orange-500 bg-orange-500/10 px-3 py-1 rounded-lg text-sm font-black border border-orange-500/20">
                   {activeCallInfo?.store}
                 </span>
                 <span className="font-mono text-slate-400">{formatDuration(callDuration)}</span>
               </div>
             ) : "待機中"}
          </h2>
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-full border border-slate-700">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gemini AI Assistant Connected</span>
             </div>
          </div>
        </header>

        <div className="flex-1 p-10 grid grid-cols-12 gap-8 overflow-hidden min-h-0">
          <div className="col-span-8 flex flex-col gap-8 min-h-0">
            <div className="bg-[#1e293b] rounded-[40px] border border-slate-800 shadow-2xl overflow-hidden flex-1 flex flex-col relative">
              {!isCalling ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 font-black tracking-widest uppercase gap-4">
                  <ICONS.Store className="w-16 h-16 opacity-20" />
                  店頭からの着信を待っています
                </div>
              ) : (
                <div className="flex-1 flex flex-col">
                  <div className="bg-slate-950 flex-1 relative overflow-hidden">
                    {customerFrame ? (
                      <img src={customerFrame} className="absolute inset-0 w-full h-full object-contain" alt="Customer Video" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center space-y-4">
                           <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                           <p className="text-xs font-black text-slate-500 tracking-widest">VIDEO CONNECTING...</p>
                        </div>
                      </div>
                    )}
                    
                    <div className="absolute bottom-6 left-6 right-6 bg-slate-900/80 backdrop-blur-xl p-8 rounded-[32px] border border-white/10 shadow-2xl">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="bg-orange-600 p-1 rounded-md"><ICONS.Check className="w-4 h-4 text-white" /></div>
                        <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Real-time AI Transcription</span>
                      </div>
                      <p className="text-xl italic font-medium leading-relaxed">
                        {transcription || "お客様の声を解析中..."}
                      </p>
                    </div>
                  </div>
                  <div className="h-24 border-t border-slate-800 flex items-center justify-center bg-slate-900/80">
                    <button onClick={() => handleEndCall()} className="px-12 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black shadow-lg transition-all active:scale-95">通話を終了する</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="col-span-4 flex flex-col gap-8 h-full overflow-hidden">
            <section className="bg-[#1e293b] p-8 rounded-[40px] border border-slate-800">
               <h3 className="font-black text-sm uppercase mb-6 text-slate-400 tracking-wider">着信情報</h3>
               {activeCallInfo ? (
                 <div className="space-y-4">
                   <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                     <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">店舗名</p>
                     <p className="font-black text-orange-500 text-lg">{activeCallInfo.store}</p>
                   </div>
                   <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                     <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">設置場所</p>
                     <p className="font-black">{activeCallInfo.loc}</p>
                   </div>
                 </div>
               ) : <p className="text-slate-600 font-bold italic">No Data</p>}
            </section>
            <section className="bg-[#1e293b] p-8 rounded-[40px] border border-slate-800 flex-1 overflow-hidden flex flex-col">
               <h3 className="font-black text-sm uppercase mb-6 text-slate-400 tracking-wider">AI 推奨回答 (Beta)</h3>
               <div className="space-y-3 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                  {STAFF_FAQ.map((faq, idx) => (
                    <div key={idx} className="p-4 bg-slate-900/30 rounded-xl text-[11px] leading-relaxed border border-slate-800 hover:border-slate-700 transition-colors">
                       <p className="font-black text-slate-300 mb-1">Q: {faq.question}</p>
                       <p className="text-slate-500 italic">A: {faq.answer}</p>
                    </div>
                  ))}
               </div>
            </section>
          </div>
        </div>
      </main>

      {incomingCall && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-fade-in">
           <div className="bg-[#1e293b] w-full max-w-md rounded-[48px] border border-white/5 overflow-hidden animate-bounce-in shadow-2xl">
              <div className="bg-orange-600 p-10 text-center text-white relative">
                 <div className="absolute top-4 right-4 animate-ping"><span className="w-3 h-3 bg-white rounded-full block" /></div>
                 <p className="text-xs font-bold opacity-80 uppercase tracking-widest mb-2">店舗からのビデオ通話着信</p>
                 <h2 className="text-4xl font-black mb-1 tracking-tight text-white">{incomingCall.storeName}</h2>
              </div>
              <div className="p-10 space-y-8 text-center">
                 <div className="bg-slate-900/50 py-3 px-6 rounded-2xl inline-block border border-slate-800">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">設置場所</p>
                    <p className="font-black text-slate-300">{incomingCall.deviceLocation}</p>
                 </div>
                 <p className="text-slate-400 font-bold leading-relaxed">お客様がお待ちです。<br/>応答してサポートを開始しますか？</p>
                 <div className="flex gap-4">
                    <button onClick={() => setIncomingCall(null)} className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl font-black text-slate-400 transition-all">拒否</button>
                    <button onClick={handleAccept} className="flex-[2] py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black shadow-lg transition-transform active:scale-95">応答する</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default StaffDashboard;
