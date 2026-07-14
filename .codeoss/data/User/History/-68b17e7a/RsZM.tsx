import React, { useState, useEffect } from 'react';
import { ICONS } from '../constants';
import { StaffStatus } from '../types';
import { signalService } from '../services/signalService';

interface Props {
  staffStatus: StaffStatus;
  onLocationUpdate?: (info: { store: string; loc: string }) => void;
}

const ConsultationFlow: React.FC<Props> = ({ staffStatus }) => {
  const [callState, setCallState] = useState<'idle' | 'calling' | 'connected'>('idle');
  const [storeName, setStoreName] = useState('幕張店'); // デフォルト値
  const [deviceLocation, setDeviceLocation] = useState('入口');

  useEffect(() => {
    // URLから店舗情報を取得
    const params = new URLSearchParams(window.location.search);
    setStoreName(params.get('store') || '不明な店舗');
    setDeviceLocation(params.get('loc') || '不明な場所');

    // 通信監視（通話終了など）
    const unsub = signalService.onMessage((event) => {
      if (event.type === 'CALL_ENDED') {
        setCallState('idle');
      } else if (event.type === 'CALL_ACCEPTED') {
        setCallState('connected');
      }
    });
    return () => unsub();
  }, []);

  const handleCallStaff = () => {
    setCallState('calling');
    // スタッフへ着信通知を飛ばす
    signalService.send({
      type: 'CALL_REQUEST',
      storeName: storeName,
      deviceLocation: deviceLocation
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6 h-[calc(100vh-120px)] flex flex-col items-center justify-center">
      {/* メインの呼び出しカード */}
      <div className="w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden border border-slate-100">
        <div className="p-12 text-center">
          <div className="inline-block bg-orange-100 p-6 rounded-full mb-8">
            <ICONS.Paint className="w-16 h-16 text-orange-600" />
          </div>
          
          <h1 className="text-4xl font-black text-slate-800 mb-4 tracking-tight">
            外壁塗装コンシェルジュ
          </h1>
          <p className="text-slate-500 text-lg mb-12">
            専門スタッフがビデオ通話でご相談を承ります。<br/>
            （現在：{storeName} {deviceLocation}）
          </p>

          {callState === 'idle' && (
            <button
              onClick={handleCallStaff}
              disabled={staffStatus === 'AWAY'}
              className={`w-full py-8 rounded-3xl font-black text-2xl transition-all shadow-xl active:scale-95 ${
                staffStatus === 'AVAILABLE' 
                ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {staffStatus === 'AVAILABLE' ? '専門スタッフを呼び出す' : 'ただいま離席中です'}
            </button>
          )}

          {callState === 'calling' && (
            <div className="space-y-6">
              <div className="flex justify-center gap-2">
                <div className="w-3 h-3 bg-orange-600 rounded-full animate-bounce" />
                <div className="w-3 h-3 bg-orange-600 rounded-full animate-bounce [animation-delay:-.3s]" />
                <div className="w-3 h-3 bg-orange-600 rounded-full animate-bounce [animation-delay:-.5s]" />
              </div>
              <p className="text-2xl font-bold text-orange-600">スタッフを呼び出し中...</p>
              <button 
                onClick={() => setCallState('idle')}
                className="text-slate-400 font-bold hover:text-slate-600"
              >
                キャンセル
              </button>
            </div>
          )}

          {callState === 'connected' && (
            <div className="bg-emerald-50 p-8 rounded-3xl border-2 border-emerald-500/20">
              <p className="text-2xl font-bold text-emerald-600 mb-4">通話中</p>
              <div className="w-full aspect-video bg-slate-900 rounded-2xl flex items-center justify-center text-white text-sm">
                ここにビデオ映像が映ります
              </div>
            </div>
          )}
        </div>

        {/* 下部の補足情報 */}
        <div className="bg-slate-50 p-6 border-t border-slate-100 flex justify-center gap-8 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${staffStatus === 'AVAILABLE' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            スタッフ待機中
          </div>
          <div>予約不要・相談無料</div>
        </div>
      </div>
    </div>
  );
};

export default ConsultationFlow;