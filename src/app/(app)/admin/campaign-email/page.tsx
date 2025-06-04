"use client";

import React, { useState, useEffect, FormEvent, useRef, ChangeEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import { toast } from '@/components/ui/use-toast';

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
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: ['campaignKey', 'email'] });
      
      // Remove header row if exists
      if (jsonData[0] && jsonData[0].campaignKey === 'campaignKey') {
        jsonData.shift();
      }

      const batch = writeBatch(firestore);
      const colRef = collection(firestore, 'campaignEmailMappings');
      
      // Create a map of existing mappings by campaignKey
      const existingMappings = new Map(
        mappings.map(m => [m.campaignKey, { id: m.id, email: m.email }])
      );

      let added = 0;
      let updated = 0;
      const seenKeys = new Set();

      // Process each row from the Excel
      for (const row of jsonData) {
        const campaignKey = String(row.campaignKey || '').trim();
        const email = String(row.email || '').trim().toLowerCase();
        
        if (!campaignKey || !email) continue;
        if (seenKeys.has(campaignKey)) continue; // Skip duplicates in the same file
        seenKeys.add(campaignKey);

        const existing = existingMappings.get(campaignKey);
        
        if (existing) {
          // Update existing mapping if email is different
          if (existing.email !== email) {
            batch.update(doc(colRef, existing.id), { email });
            updated++;
          }
        } else {
          // Add new mapping
          const docRef = doc(colRef);
          batch.set(docRef, { campaignKey, email });
          added++;
        }
      }

      await batch.commit();
      await updateVersion();
      
      let message = [];
      if (added > 0) message.push(`추가: ${added}개`);
      if (updated > 0) message.push(`수정: ${updated}개`);
      
      toast({
        title: "완료",
        description: message.length > 0 ? message.join(', ') : '변경사항이 없습니다.',
        variant: "default",
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      toast({
        title: "오류",
        description: "파일 업로드 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (!isAdmin) {
    return <p className="mt-10 text-center">접근 권한이 없습니다.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">캠페인 이메일 매핑 관리</h1>
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? '업로드 중...' : '엑셀 업로드'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </Button>
          <div className="text-xs text-muted-foreground mt-1">
            엑셀 형식: 1열 - 캠페인 키, 2열 - 이메일 주소
          </div>
        </div>
      </div>
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

