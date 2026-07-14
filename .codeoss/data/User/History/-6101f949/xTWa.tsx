
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import ConsultationFlow from './components/ConsultationFlow';
import StaffDashboard from './components/StaffDashboard';
import { StaffStatus } from './types';
import { signalService } from './services/signalService';

const App: React.FC = () => {
  const [view, setView] = useState<'storefront' | 'staff'>('storefront');
  const [staffStatus, setStaffStatus] = useState<StaffStatus>('AVAILABLE');
  const [locationInfo, setLocationInfo] = useState<{ store: string; loc: string } | undefined>();

  useEffect(() => {
// 1. URLパラメータから店舗情報を取得する処理を追加
    const params = new URLSearchParams(window.location.search);
    const store = params.get('store') || '未設定店舗';
    const loc = params.get('loc') || '未設定場所';
    setLocationInfo({ store, loc });

    const handleHashChange = () => {
      if (window.location.hash === '#staff') {
        setView('staff');
      } else {
        setView('storefront');
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);

    // ステータス更新の監視
    const unsub = signalService.onMessage((event) => {
      if (event.type === 'STATUS_UPDATE') {
        setStaffStatus(event.status);
      }
    });

    // 起動時に現在のステータスを要求
    if (view === 'storefront') {
      signalService.send({ type: 'STATUS_REQUEST' });
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      unsub();
    };
  }, [view]);

  if (view === 'staff') {
    return <StaffDashboard />;
  }

  return (
    <Layout staffStatus={staffStatus} locationInfo={locationInfo}>
      <ConsultationFlow 
        staffStatus={staffStatus} 
        onLocationUpdate={(info) => setLocationInfo(info)}
      />
      <div className="fixed bottom-24 right-4 z-[100]">
        <a 
          href="#staff" 
          className="bg-slate-800/80 hover:bg-slate-800 text-white text-[10px] px-3 py-1 rounded-full backdrop-blur-sm transition-all"
        >
          スタッフ画面(Demo)へ
        </a>
      </div>
    </Layout>
  );
};

export default App;
