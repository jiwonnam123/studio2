"use client";

import React, { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Mapping {
  id: string;
  campaignKey: string;
  email: string;
}

const ADMIN_EMAIL = 'jirrral@gmail.com';

export default function CampaignEmailAdminPage() {
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [campaignKey, setCampaignKey] = useState('');
  const [email, setEmail] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const colRef = collection(firestore, 'campaignEmailMappings');
    const unsub = onSnapshot(colRef, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Mapping, 'id'>) }));
      setMappings(data);
    });
    return () => unsub();
  }, [isAdmin]);

  const resetForm = () => {
    setCampaignKey('');
    setEmail('');
    setEditingId(null);
  };

  const updateVersion = async () => {
    await setDoc(doc(firestore, 'metadata', 'campaignEmailMappingsVersion'), { updatedAt: serverTimestamp() });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!campaignKey || !email) return;
    const colRef = collection(firestore, 'campaignEmailMappings');
    if (editingId) {
      await updateDoc(doc(colRef, editingId), { campaignKey, email });
    } else {
      await addDoc(colRef, { campaignKey, email });
    }
    await updateVersion();
    resetForm();
  };

  const handleEdit = (m: Mapping) => {
    setCampaignKey(m.campaignKey);
    setEmail(m.email);
    setEditingId(m.id);
  };

  const handleDelete = async (id: string) => {
    const colRef = collection(firestore, 'campaignEmailMappings');
    await deleteDoc(doc(colRef, id));
    await updateVersion();
    if (editingId === id) resetForm();
  };

  if (!isAdmin) {
    return <p className="mt-10 text-center">접근 권한이 없습니다.</p>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">캠페인 이메일 매핑 관리</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input value={campaignKey} onChange={(e) => setCampaignKey(e.target.value)} placeholder="캠페인 키" />
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" />
        <div className="flex gap-2">
          <Button type="submit">{editingId ? '수정' : '추가'}</Button>
          {editingId && (
            <Button type="button" variant="outline" onClick={resetForm}>
              취소
            </Button>
          )}
        </div>
      </form>
      <ul className="space-y-2">
        {mappings.map((m) => (
          <li key={m.id} className="flex items-center justify-between rounded-md border p-2">
            <span>
              {m.campaignKey} → {m.email}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleEdit(m)}>
                편집
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleDelete(m.id)}>
                삭제
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

