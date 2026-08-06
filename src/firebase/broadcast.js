import { useState, useEffect } from "react";
import {
  collection, query, where, addDoc, deleteDoc, doc, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { db } from "./config";
import { getOrCreateDirectChat, sendTextMessage } from "./chats";

// WhatsApp-style broadcast lists: one message, sent as individual direct chats
// to every member (recipients see a normal 1-on-1 DM, not a group).
export function useBroadcastLists(myUid) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!myUid) return;
    const q = query(collection(db, "broadcastLists"), where("ownerUid", "==", myUid));
    const unsub = onSnapshot(q, (snap) => {
      setLists(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [myUid]);

  return { lists, loading };
}

export async function createBroadcastList(myUid, name, memberUids) {
  const ref = await addDoc(collection(db, "broadcastLists"), {
    ownerUid: myUid,
    name: name.trim() || "Broadcast",
    memberUids: memberUids || [],
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteBroadcastList(listId) {
  await deleteDoc(doc(db, "broadcastLists", listId));
}

// Sends `text` to every member as an individual DM. Returns the list of
// member uids that were sent to (in order). Failures are collected so one
// broken recipient doesn't abort the rest.
export async function sendBroadcastText(myUid, memberUids, text) {
  const sent = [];
  const failed = [];
  for (const uid of memberUids) {
    try {
      const chatId = await getOrCreateDirectChat(myUid, uid);
      await sendTextMessage(chatId, myUid, text, [myUid, uid]);
      sent.push(uid);
    } catch {
      failed.push(uid);
    }
  }
  return { sent, failed };
}
