import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { StaffStatus } from '../types';

// ★重要：Firebaseのコンソールから取得した自分の設定をここに貼ってください
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export type SignalEvent = 
  | { type: 'CALL_REQUEST'; storeName: string; deviceLocation: string }
  | { type: 'CALL_ACCEPTED' }
  | { type: 'CALL_REJECTED' }
  | { type: 'CALL_ENDED' }
  | { type: 'STAFF_LOGIN'; staffId: string } // ← 追加
  | { type: 'STATUS_UPDATE'; status: StaffStatus; storeInfo?: { store: string; loc: string } }
  | { type: 'STATUS_REQUEST' };

class SignalService {
  private listeners: ((event: SignalEvent) => void)[] = [];

  constructor() {
    // Firestoreの 'signals' コレクションを監視する
    const q = query(collection(db, 'signals'), orderBy('timestamp', 'desc'), limit(1));
    
    onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data() as any;
          // 自分が出した信号でなければ、リスナーに通知する
          this.listeners.forEach(l => l(data as SignalEvent));
        }
      });
    });
  }

  async send(event: SignalEvent) {
    try {
      // 信号をFirestoreに書き込む（これで全端末に届く）
      await addDoc(collection(db, 'signals'), {
        ...event,
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