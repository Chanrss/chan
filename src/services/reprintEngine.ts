import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  updateDoc, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db } from './firebase';
import { Bill, BillItem } from '../types';

export class ReprintEngine {
  /**
   * Looks up a bill by bill number (and optional businessDate) or bill ID
   */
  static async findBill(searchParam: string, businessDate?: string): Promise<Bill | null> {
    const trimmed = searchParam.trim();
    if (!trimmed) return null;

    // Check if input is a direct bill ID
    if (trimmed.startsWith('bill_')) {
      const docRef = doc(db, 'bills', trimmed);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const billData = snap.data() as Bill;
        const items = await ReprintEngine.getBillItems(billData.id);
        return { ...billData, items };
      }
    }

    // Standardize bill number (e.g., "1" -> "01")
    let searchBillNum = trimmed;
    const numVal = parseInt(trimmed, 10);
    if (!isNaN(numVal) && numVal < 10 && !trimmed.startsWith('0')) {
      searchBillNum = `0${numVal}`;
    }

    // Query bills collection
    let billsQuery;
    if (businessDate) {
      billsQuery = query(
        collection(db, 'bills'),
        where('businessDate', '==', businessDate),
        where('billNumber', '==', searchBillNum),
        limit(1)
      );
    } else {
      billsQuery = query(
        collection(db, 'bills'),
        where('billNumber', '==', searchBillNum),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
    }

    const querySnapshot = await getDocs(billsQuery);
    if (!querySnapshot.empty) {
      const billData = querySnapshot.docs[0].data() as Bill;
      const items = await ReprintEngine.getBillItems(billData.id);
      return { ...billData, items };
    }

    return null;
  }

  /**
   * Fetches all snapshot items for a given bill ID
   */
  static async getBillItems(billId: string): Promise<BillItem[]> {
    const itemsQuery = query(
      collection(db, 'bill_items'),
      where('billId', '==', billId)
    );
    const snap = await getDocs(itemsQuery);
    return snap.docs.map((d) => d.data() as BillItem);
  }

  /**
   * Records a reprint event without changing the bill number or altering bill items
   */
  static async recordReprint(billId: string, reprintedBy: string): Promise<void> {
    try {
      const billRef = doc(db, 'bills', billId);
      const billSnap = await getDoc(billRef);
      if (billSnap.exists()) {
        const currentCount = billSnap.data().reprintCount || 0;
        await updateDoc(billRef, {
          reprintCount: currentCount + 1,
          lastReprintedAt: Date.now(),
          lastReprintedBy: reprintedBy
        });
      }
    } catch (e) {
      console.warn('Could not record reprint metadata:', e);
    }
  }
}
