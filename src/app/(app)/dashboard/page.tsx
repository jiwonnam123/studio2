
"use client";

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle, ListChecks, MoreHorizontal, CheckCircle, XCircle, Clock, Loader2, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SubmittedInquiry, SubmittedInquiryDataRow } from '@/types';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { InquiryModal } from '@/components/modals/inquiry/InquiryModal';
import { useAuth } from '@/contexts/AuthContext';
import { firestore } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, Timestamp, doc, updateDoc, writeBatch, getDoc, type DocumentData, limit, startAfter, getDocs, endBefore, limitToLast } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ADMIN_EMAIL = 'jirrral@gmail.com';
const STATUS_OPTIONS_KOREAN = ["처리 전", "처리 중", "보류 중", "처리 완료", "종료됨", "정보 필요"];
const ITEMS_PER_PAGE = 20;

interface FlattenedDataRow extends SubmittedInquiryDataRow {
  key: string;
  originalInquiryId: string;
  originalInquirySubmittedAt: string;
  originalDataRowIndex: number;
  submitterUserId?: string;
  submissionSource?: 'excel' | 'direct';
  submissionFileName?: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [submittedInquiries, setSubmittedInquiries] = useState<SubmittedInquiry[]>([]);
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedRows, setSelectedRows] = useState<Map<string, FlattenedDataRow>>(new Map());
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const isAdmin = useMemo(() => user?.email === ADMIN_EMAIL, [user?.email]);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  const fetchInquiries = useCallback(async () => {
    if (!user?.id) {
      setSubmittedInquiries([]);
      setIsLoadingInquiries(false);
      return;
    }

    setIsLoadingInquiries(true);
    const inquiriesRef = collection(firestore, "inquiries");
    let q;

    const baseQueryConstraints = isAdmin
      ? []
      : [where("userId", "==", user.id)];

    q = query(
      inquiriesRef,
      ...baseQueryConstraints,
      orderBy("submittedAt", "desc")
    );
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedInquiries = querySnapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data() as DocumentData;
        let submittedAtStr = '';
        if (data.submittedAt instanceof Timestamp) {
          submittedAtStr = data.submittedAt.toDate().toISOString();
        } else if (typeof data.submittedAt === 'string') {
          submittedAtStr = data.submittedAt;
        } else if (data.submittedAt && typeof data.submittedAt.toDate === 'function') {
           submittedAtStr = data.submittedAt.toDate().toISOString();
        } else {
            submittedAtStr = new Date(0).toISOString(); 
        }

        const processedDataArray = (Array.isArray(data.data) ? data.data : []).map((item: Partial<SubmittedInquiryDataRow>) => ({
            campaignKey: item.campaignKey || '',
            campaignName: item.campaignName || '',
            adidOrIdfa: item.adidOrIdfa || '',
            userName: item.userName || '',
            contact: item.contact || '',
            remarks: item.remarks || '',
            status: item.status || "처리 전",
            adminNotes: item.adminNotes || '',
        }));

        return {
          id: docSnapshot.id,
          userId: data.userId,
          source: data.source,
          fileName: data.fileName,
          data: processedDataArray,
          submittedAt: submittedAtStr,
          status: data.status || "처리 전", 
          adminNotes: data.adminNotes || '',
        } as SubmittedInquiry;
      });
      setSubmittedInquiries(fetchedInquiries);
      setIsLoadingInquiries(false);
      setSelectedRows(new Map()); 
    }, (error) => {
      console.error("Error fetching inquiries: ", error);
      toast({ title: "오류", description: "제출된 문의를 가져올 수 없습니다.", variant: "destructive" });
      setIsLoadingInquiries(false);
    });

    return unsubscribe;
  }, [user?.id, isAdmin, toast]); 

  useEffect(() => {
    const unsubscribePromise = fetchInquiries();
    return () => {
        unsubscribePromise.then(unsub => {
            if (typeof unsub === 'function') {
                unsub();
            }
        }).catch(err => console.error("Error unsubscribing from inquiries:", err));
    }
  }, [fetchInquiries]); 

  const flattenedDataRows: FlattenedDataRow[] = useMemo(() => {
    return submittedInquiries.flatMap((inquiry) =>
      (Array.isArray(inquiry.data) ? inquiry.data : []).map((dataRow, dataRowIndex) => ({
        ...dataRow,
        key: `${inquiry.id}-row-${dataRowIndex}`,
        originalInquiryId: inquiry.id,
        originalInquirySubmittedAt: inquiry.submittedAt,
        originalDataRowIndex: dataRowIndex,
        submitterUserId: isAdmin ? inquiry.userId : undefined,
        submissionSource: isAdmin ? inquiry.source : undefined,
        submissionFileName: isAdmin ? inquiry.fileName : undefined,
      }))
    );
  }, [submittedInquiries, isAdmin]);

  const totalItems = flattenedDataRows.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const paginatedDataRows = useMemo(() => {
    if (totalItems === 0) return [];
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return flattenedDataRows.slice(startIndex, endIndex);
  }, [flattenedDataRows, currentPage, totalItems]);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    } else if (totalPages === 0 && totalItems === 0 && currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage, totalItems]);


  const handleIndividualStatusChange = async (inquiryId: string, dataRowIndex: number, newStatus: string) => {
    if (!isAdmin) {
        toast({ title: "권한 없음", description: "관리자만 상태를 변경할 수 있습니다.", variant: "destructive" });
        return;
    }
    try {
        const inquiryRef = doc(firestore, "inquiries", inquiryId);
        const docSnap = await getDoc(inquiryRef);
        if (!docSnap.exists()) {
            toast({ title: "오류", description: "데이터베이스에서 문의를 찾을 수 없습니다.", variant: "destructive" });
            return;
        }
        const currentInquiryData = docSnap.data()?.data as SubmittedInquiryDataRow[];
        if (!currentInquiryData) {
            toast({ title: "오류", description: "문의 데이터가 없거나 형식이 잘못되었습니다.", variant: "destructive" });
            return;
        }

        const newDataArray = [...currentInquiryData];
        if (newDataArray[dataRowIndex]) {
            newDataArray[dataRowIndex] = { ...newDataArray[dataRowIndex], status: newStatus, adminNotes: newDataArray[dataRowIndex].adminNotes || '' };
            await updateDoc(inquiryRef, { data: newDataArray });
            toast({ title: "상태 업데이트됨", description: `상태가 ${newStatus}(으)로 변경되었습니다.` });
        } else {
            toast({ title: "오류", description: "데이터 행 인덱스가 범위를 벗어났습니다.", variant: "destructive" });
        }
    } catch (error) {
        console.error("상태 업데이트 오류:", error);
        toast({ title: "오류", description: "상태를 업데이트할 수 없습니다.", variant: "destructive" });
    }
  };

  const handleRowSelectionChange = (row: FlattenedDataRow, checked: boolean | 'indeterminate') => {
    setSelectedRows(prev => {
      const newSelectedRows = new Map(prev);
      if (checked === true) {
        newSelectedRows.set(row.key, row);
      } else {
        newSelectedRows.delete(row.key);
      }
      return newSelectedRows;
    });
  };

  const handleSelectAllOnPage = (checked: boolean | 'indeterminate') => {
    setSelectedRows(prev => {
      const newSelectedRows = new Map(prev);
      if (checked === true) {
        paginatedDataRows.forEach(row => newSelectedRows.set(row.key, row));
      } else {
        paginatedDataRows.forEach(row => newSelectedRows.delete(row.key));
      }
      return newSelectedRows;
    });
  };

  const handleBulkStatusUpdate = async () => {
    if (selectedRows.size === 0) {
      toast({ title: "선택된 항목 없음", description: "업데이트할 항목을 선택해주세요.", variant: "destructive" });
      return;
    }
    if (!bulkStatus) {
      toast({ title: "선택된 상태 없음", description: "적용할 상태를 선택해주세요.", variant: "destructive" });
      return;
    }
    if (!isAdmin) {
      toast({ title: "권한 없음", description: "관리자만 상태를 변경할 수 있습니다.", variant: "destructive" });
      return;
    }

    setIsBulkUpdating(true);
    const batch = writeBatch(firestore);
    const updatesByInquiryId = new Map<string, { inquiryRef: any, updatedDataArray: SubmittedInquiryDataRow[] }>();

    // Fetch all necessary documents first (optimized slightly)
    const uniqueInquiryIds = Array.from(new Set(Array.from(selectedRows.values()).map(row => row.originalInquiryId)));
    const docPromises = uniqueInquiryIds.map(id => getDoc(doc(firestore, "inquiries", id)));
    const docSnapshots = await Promise.all(docPromises);

    const inquiryDocsMap = new Map<string, DocumentData | null>();
    docSnapshots.forEach((docSnap, index) => {
        if (docSnap.exists()) {
            inquiryDocsMap.set(uniqueInquiryIds[index], docSnap.data());
        } else {
            inquiryDocsMap.set(uniqueInquiryIds[index], null);
        }
    });
    
    for (const row of selectedRows.values()) {
      if (!updatesByInquiryId.has(row.originalInquiryId)) {
        const inquiryData = inquiryDocsMap.get(row.originalInquiryId);
        if (inquiryData) {
           updatesByInquiryId.set(row.originalInquiryId, {
            inquiryRef: doc(firestore, "inquiries", row.originalInquiryId),
            updatedDataArray: [...(inquiryData?.data as SubmittedInquiryDataRow[] || [])]
          });
        } else {
          console.warn(`Document ${row.originalInquiryId} not found, skipping row ${row.key} for bulk update.`);
          continue;
        }
      }

      const inquiryUpdate = updatesByInquiryId.get(row.originalInquiryId);
      if (inquiryUpdate && inquiryUpdate.updatedDataArray[row.originalDataRowIndex]) {
        inquiryUpdate.updatedDataArray[row.originalDataRowIndex].status = bulkStatus;
      }
    }

    updatesByInquiryId.forEach(({ inquiryRef, updatedDataArray }) => {
      batch.update(inquiryRef, { data: updatedDataArray });
    });

    try {
      await batch.commit();
      toast({ title: "일괄 상태 업데이트 성공", description: `${selectedRows.size}개 항목이 ${bulkStatus}(으)로 업데이트되었습니다.` });
      setSelectedRows(new Map());
      setBulkStatus('');
    } catch (error) {
      console.error("일괄 상태 업데이트 오류:", error);
      toast({ title: "일괄 업데이트 실패", description: "선택된 모든 항목을 업데이트할 수 없었습니다.", variant: "destructive" });
    } finally {
      setIsBulkUpdating(false);
    }
  };


  const handleNextPageLocal = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages || 1));
  };

  const handlePreviousPageLocal = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };


  if (!mounted) {
    return (
       <div className="space-y-8 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-1/3 rounded" />
           <Skeleton className="h-10 w-36 rounded" />
        </div>
        <div className="animate-pulse space-y-2 mt-8">
            <Skeleton className="h-8 w-1/3 rounded" />
        </div>
        <Skeleton className="h-40 w-full rounded bg-muted mt-4" />
      </div>
    );
  }

  const renderStatusBadge = (status: string) => {
    let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
    let icon = <Clock className="mr-1 h-3 w-3" />;

    switch (status?.toLowerCase()) {
      case "처리 전":
      case "pending":
        variant = "outline";
        icon = <Clock className="mr-1 h-3 w-3 text-yellow-500" />;
        break;
      case "처리 중":
      case "in progress":
        variant = "secondary";
        icon = <Loader2 className="mr-1 h-3 w-3 animate-spin text-blue-500" />;
        break;
      case "보류 중":
      case "hold":
        variant = "outline";
        icon = <Clock className="mr-1 h-3 w-3 text-orange-500" />; // Custom color for hold
        break;
      case "처리 완료":
      case "resolved":
        variant = "default"; // Using default for green-like success
        icon = <CheckCircle className="mr-1 h-3 w-3 text-green-500" />;
        break;
      case "종료됨":
      case "closed":
        variant = "default";
        icon = <CheckCircle className="mr-1 h-3 w-3 text-green-500" />;
        break;
      case "정보 필요":
      case "info needed":
         variant = "destructive";
         icon = <XCircle className="mr-1 h-3 w-3 text-red-500" />;
        break;
      default:
        variant = "secondary";
        icon = <ListChecks className="mr-1 h-3 w-3 text-muted-foreground" />
    }
    return <Badge variant={variant} className="capitalize text-xs py-0.5 px-1.5 flex items-center w-fit">{icon} {status || 'N/A'}</Badge>;
  };
  
  const isAllOnPageSelected = paginatedDataRows.length > 0 && paginatedDataRows.every(row => selectedRows.has(row.key));
  const isSomeOnPageSelected = paginatedDataRows.length > 0 && paginatedDataRows.some(row => selectedRows.has(row.key)) && !isAllOnPageSelected;


  return (
    <div className="space-y-8 p-4 md:p-6">
      <section>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">문의 내역</h1>
          </div>
          <Button onClick={() => setIsInquiryModalOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" /> 문의 제출
          </Button>
        </div>

        {isAdmin && (
          <Card className="mb-6 shadow-sm border-dashed bg-muted/30">
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="text-base">일괄 상태 업데이트</CardTitle>
              <CardDescription className="text-xs">아래 표에서 항목을 선택하고, 상태를 선택한 후 저장하세요.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row items-center gap-3">
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger className="w-full sm:w-[200px] h-9">
                  <SelectValue placeholder="적용할 상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS_KOREAN.map(statusOption => (
                    <SelectItem key={statusOption} value={statusOption}>
                      {statusOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleBulkStatusUpdate}
                disabled={isBulkUpdating || selectedRows.size === 0 || !bulkStatus}
                size="sm"
                className="w-full sm:w-auto"
              >
                {isBulkUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                선택 항목 ({selectedRows.size}개) 상태 저장
              </Button>
            </CardContent>
          </Card>
        )}


        {isLoadingInquiries ? (
          <Card>
             <CardHeader>
                <Skeleton className="h-8 w-1/2"/>
                <Skeleton className="h-4 w-3/4 mt-1"/>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <Skeleton className="h-10 w-full rounded" />
                <Skeleton className="h-10 w-full rounded" />
                <Skeleton className="h-10 w-full rounded" />
              </div>
            </CardContent>
          </Card>
        ) : flattenedDataRows.length === 0 ? (
          <Card>
            <CardHeader>
                <CardTitle>제출된 문의가 없습니다</CardTitle>
                <CardDescription>"문의 제출"을 클릭하여 첫 문의를 기록하세요.</CardDescription>
            </CardHeader>
            <CardContent className="text-center py-10">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-2 text-xl font-semibold">표시할 데이터 없음</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                아직 문의를 제출하지 않았습니다.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="shadow-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin ? (
                      <TableHead className="w-[30px] px-1 py-2 text-center">
                        <Checkbox 
                          checked={isAllOnPageSelected || (isSomeOnPageSelected ? "indeterminate" : false)} 
                          onCheckedChange={handleSelectAllOnPage} 
                          aria-label="이 페이지의 모든 항목 선택"
                        />
                      </TableHead>
                    ) : null}
                    <TableHead className="w-[100px] py-2 px-3 text-left">제출일</TableHead>
                    <TableHead className="min-w-[120px] max-w-[150px] py-2 px-3 text-left">캠페인 키</TableHead>
                    <TableHead className="min-w-[150px] max-w-[200px] py-2 px-3 text-left">캠페인 명</TableHead>
                    <TableHead className="min-w-[120px] max-w-[150px] py-2 px-3 text-left">ADID/IDFA</TableHead>
                    <TableHead className="w-[100px] py-2 px-3 text-left">사용자 이름</TableHead>
                    <TableHead className="w-[110px] py-2 px-3 text-left">연락처</TableHead>
                    <TableHead className="flex-1 min-w-[150px] py-2 px-3 text-left">비고</TableHead>
                    <TableHead className="w-[120px] py-2 px-3 text-center">처리 상태</TableHead>
                    {isAdmin ? (<TableHead className="w-[70px] py-2 px-3 text-center">편집</TableHead>) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDataRows.map((row) => (
                    <TableRow key={row.key} className="text-xs hover:bg-muted/50" data-state={selectedRows.has(row.key) ? "selected" : ""}>
                      {isAdmin ? (
                        <TableCell className="px-1 py-1 text-center">
                          <Checkbox 
                            checked={selectedRows.has(row.key)} 
                            onCheckedChange={(checked) => handleRowSelectionChange(row, checked)} 
                            aria-labelledby={`label-select-row-${row.key}`}
                          />
                          <span id={`label-select-row-${row.key}`} className="sr-only">캠페인 키 ${row.campaignKey} 행 선택</span>
                        </TableCell>
                      ) : null}
                      <TableCell className="font-medium py-2 px-3 text-left">{row.originalInquirySubmittedAt ? format(new Date(row.originalInquirySubmittedAt), "yyyy-MM-dd") : 'N/A'}</TableCell>
                      <TableCell className="py-2 px-3 text-left truncate max-w-[150px]">{row.campaignKey}</TableCell>
                      <TableCell className="py-2 px-3 text-left truncate max-w-[200px]">{row.campaignName}</TableCell>
                      <TableCell className="py-2 px-3 text-left truncate max-w-[150px]">{row.adidOrIdfa}</TableCell>
                      <TableCell className="py-2 px-3 text-left truncate max-w-[100px]">{row.userName}</TableCell>
                      <TableCell className="py-2 px-3 text-left truncate max-w-[110px]">{row.contact}</TableCell>
                      <TableCell className="py-2 px-3 text-left whitespace-normal break-words">{row.remarks}</TableCell>
                      <TableCell className="py-2 px-3 text-center">{renderStatusBadge(row.status)}</TableCell>
                      {isAdmin ? (
                        <TableCell className="py-2 px-3 text-center">
                          <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                      <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>상태 업데이트</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuRadioGroup
                                      value={row.status}
                                      onValueChange={(newStatus) => handleIndividualStatusChange(row.originalInquiryId, row.originalDataRowIndex, newStatus)}
                                  >
                                      {STATUS_OPTIONS_KOREAN.map(statusOption => (
                                          <DropdownMenuRadioItem key={statusOption} value={statusOption}>
                                              {statusOption}
                                          </DropdownMenuRadioItem>
                                      ))}
                                  </DropdownMenuRadioGroup>
                              </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
                <TableCaption>
                    {/* Removed caption text */}
                </TableCaption>
              </Table>
            </Card>
            {totalPages > 1 && (
              <div className="flex items-center justify-end space-x-2 py-4 mt-4 border-t pt-4">
                <span className="text-sm text-muted-foreground">
                  페이지 {totalPages > 0 ? currentPage : 0} / {totalPages > 0 ? totalPages : 0}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPageLocal}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> 이전
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPageLocal}
                  disabled={currentPage === totalPages || totalItems === 0}
                >
                  다음 <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <InquiryModal open={isInquiryModalOpen} onOpenChange={setIsInquiryModalOpen} />
    </div>
  );
}
