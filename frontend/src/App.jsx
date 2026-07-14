// frontend/src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import StorePage from './pages/StorePage';
import CenterPage from './pages/CenterPage';


function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* /store/shibuya のように打つとStorePageが出る */}
        <Route path="/store/:storeId" element={<StorePage />} />
        {/* /center と打つとCenterPageが出る */}
        <Route path="/center" element={<CenterPage />} />
        {/* それ以外はとりあえずトップを表示 */}
        <Route path="/" element={<div style={{ padding: '20px' }}><h1>ホームセンター通話アプリ</h1><p>URLの末尾に /center または /store/店名 を入れてください</p></div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;