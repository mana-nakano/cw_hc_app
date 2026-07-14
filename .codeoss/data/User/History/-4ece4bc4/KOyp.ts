import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, serverTimestamp, query, orderBy, where, Timestamp } from 'firebase/firestore';
import { StaffStatus } from '../types';

const firebaseConfig = {
  apiKey: "AIzaSyARxTcpwn_pBsD4Kp__c4NRZfbkoRi3Apw",
  authDomain: "gen-lang-client-0472221223.firebaseapp.com",
  projectId: "gen-lang-client-0472221223",
  storageBucket: "gen-lang-client-0472221223.firebasestorage.app",
  messagingSenderId: "250404947892",
  appId: "1:250404947892:web:dda3e1f8e9d771d42554e1",
  measurementId: "G-3D3PK3YRG7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 自分の送信を無視するためのユニークID
const myClientId = Math.random().toString(36).substring(7);
// アプリを起動した時刻（これ以前の古い信号は無視する）
const appStartTime = new Date();

export type SignalEvent = 
  | { type: 'CALL_REQUEST'; storeName: string; deviceLocation: string }
  | { type: 'CALL_ACCEPTED'; staffId: string }
  | { type: 'CALL_ENDED' }
  | { type: 'STAFF_LOGIN'; staffId: string }
  | { type: 'STATUS_UPDATE'; status: StaffStatus }
  | { type: 'STATUS_REQUEST' };

class SignalService {
  private listeners: ((event: SignalEvent) => void)[] = [];

  constructor() {
    // 1. limit(1)を削除し、起動時刻以降の信号のみを監視する
    const q = query(
      collection(db, 'signals'), 
      where('timestamp', '>', appStartTime),
      orderBy('timestamp', 'asc') 
    );
    
    onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          // 2. 自分が送った信号（clientIdが一致するもの）は無視する
          if (data.clientId !== myClientId) {
            this.listeners.forEach(l => l(data as SignalEvent));
          }
        }
      });
    });
  }

  async send(event: SignalEvent) {
    try {
      await addDoc(collection(db, 'signals'), {
        ...event,
        clientId: myClientId, // 自分のIDを添えて送る
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("信号の送信に失敗しました", e);
    }
  }

  onMessage(callback: (event: SignalEvent) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }
}

export const signalService = new SignalService();