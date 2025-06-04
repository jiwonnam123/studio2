"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlusCircle, ListChecks, MoreHorizontal, CheckCircle, XCircle, Clock, Loader2, ChevronLeft, ChevronRight, FileText, FilterX } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAdminEmail } from '@/hooks/use-admin-email';

const STATUS_OPTIONS_KOREAN = ["처리 전", "처리 중", "처리 완료"];
const ITEMS_PER_PAGE = 20;

interface FlattenedDataRow extends SubmittedInquiryDataRow {
  key: string;
  originalInquiryId: string;
  originalInquirySubmittedAt: string;
  originalDataRowIndex: number;
  submitterUserId?: string;
  submissionSource?: 'excel' | 'direct';
  submissionFileName?: string;
  [key: string]: any;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const adminEmail = useAdminEmail();
  const { toast } = useToast();
  const [submittedInquiries, setSubmittedInquiries] = useState<SubmittedInquiry[]>([]);
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [animationDirection, setAnimationDirection] = useState<'next' | 'prev'>('next');

  // States for search functionality
  const [searchColumn, setSearchColumn] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [activeSearchColumn, setActiveSearchColumn] = useState('all');

  const [selectedRows, setSelectedRows] = useState<Map<string, FlattenedDataRow>>(new Map());
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const isAdmin = useMemo(() => user?.email === adminEmail, [user?.email, adminEmail]);

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

        const processedDataArray = (Array.isArray(data.data) ? data.data : []).map((item: Partial<SubmittedInquiryDataRow>) => {
            // Map old status values to new ones
            let status = item.status || "처리 전";
            if (status === "보류 중") status = "처리 중";
            if (status === "종료됨" || status === "정보 필요") status = "처리 완료";
            
            return {
                campaignKey: item.campaignKey || '',
                campaignName: item.campaignName || '',
                adidOrIdfa: item.adidOrIdfa || '',
                userName: item.userName || '',
                contact: item.contact || '',
                remarks: item.remarks || '',
                status: status,
                adminNotes: item.adminNotes || '',
                result: item.result || '', // Add result field
            };
        });

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

  const filteredDataRows = useMemo(() => {
    let result = flattenedDataRows;

    // Apply text search filter
    if (activeSearchTerm.trim()) {
      const lowercasedSearchTerm = activeSearchTerm.toLowerCase();
      result = result.filter(row => {
        if (activeSearchColumn === 'all') {
          return (
            (row.campaignKey || '').toLowerCase().includes(lowercasedSearchTerm) ||
            (row.campaignName || '').toLowerCase().includes(lowercasedSearchTerm) ||
            (row.adidOrIdfa || '').toLowerCase().includes(lowercasedSearchTerm) ||
            (row.userName || '').toLowerCase().includes(lowercasedSearchTerm) ||
            (row.contact || '').toLowerCase().includes(lowercasedSearchTerm) ||
            (row.remarks || '').toLowerCase().includes(lowercasedSearchTerm)
          );
        } else {
          if (Object.prototype.hasOwnProperty.call(row, activeSearchColumn)) {
            const columnValue = (row as any)[activeSearchColumn];
            if (typeof columnValue === 'string') {
              return columnValue.toLowerCase().includes(lowercasedSearchTerm);
            }
          }
          return false;
        }
      });
    }

    return result;
  }, [flattenedDataRows, activeSearchColumn, activeSearchTerm]);

  const totalItems = filteredDataRows.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const paginatedDataRows = useMemo(() => {
    if (totalItems === 0) return [];
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredDataRows.slice(startIndex, endIndex);
  }, [filteredDataRows, currentPage, totalItems]);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    } else if (totalPages === 0 && totalItems === 0 && currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage, totalItems]);

  const handleIndividualStatusChange = async (inquiryId: string, dataRowIndex: number, newStatus: string, result: string = '') => {
    if (!isAdmin) {
        toast({ title: "권한 없음", description: "관리자만 상태를 변경할 수 있습니다.", variant: "destructive" });
        return;
    }
    
    // Validate the new status
    if (!STATUS_OPTIONS_KOREAN.includes(newStatus)) {
        toast({ title: "오류", description: "유효하지 않은 상태 값입니다.", variant: "destructive" });
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
            newDataArray[dataRowIndex] = { 
              ...newDataArray[dataRowIndex], 
              status: newStatus, 
              adminNotes: newDataArray[dataRowIndex].adminNotes || '',
              result: result || newDataArray[dataRowIndex].result || ''
            };
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
    setAnimationDirection('next');
    setCurrentPage((prev) => Math.min(prev + 1, totalPages || 1));
  };

  const handlePreviousPageLocal = () => {
    setAnimationDirection('prev');
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  // Animation variants
  const mainContentVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
  };

  const tableAnimationVariants = {
    initial: (direction: 'next' | 'prev') => ({
      x: direction === 'next' ? '30px' : '-30px',
      opacity: 0,
    }),
    animate: {
      x: 0,
      opacity: 1,
      transition: { duration: 0.2, ease: 'easeInOut' },
    },
    exit: (direction: 'next' | 'prev') => ({
      x: direction === 'next' ? '-30px' : '30px',
      opacity: 0,
      transition: { duration: 0.2, ease: 'easeInOut' },
    }),
  };

  if (!mounted) {
    return (
      <div className="p-4 sm:p-6 md:p-8 min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const renderStatusBadge = (status: string | undefined) => {
    if (!status) return <Badge variant="outline" className="capitalize text-xs">N/A</Badge>;
    
    let variant: "default" | "secondary" | "outline" | "destructive" = "secondary";
    let icon = <ListChecks className="mr-1 h-3 w-3 text-muted-foreground" />;
    
    switch (status.toLowerCase()) {
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
    return <div className="text-left"><Badge variant={variant} className="capitalize text-xs py-0.5 px-1.5 flex items-center w-fit">{icon} {status || 'N/A'}</Badge></div>;
  };
  
  const isAllOnPageSelected = paginatedDataRows.length > 0 && paginatedDataRows.every(row => selectedRows.has(row.key));
  const isSomeOnPageSelected = paginatedDataRows.length > 0 && paginatedDataRows.some(row => selectedRows.has(row.key)) && !isAllOnPageSelected;

  // Moved searchColumnOptions definition here, before the return statement
  const searchColumnOptions = [
    { value: 'all', label: '전체' },
    { value: 'campaignKey', label: '캠페인 키' },
    { value: 'campaignName', label: '캠페인 명' },
    { value: 'adidOrIdfa', label: 'ADID/IDFA' },
    { value: 'userName', label: '이름' },
    { value: 'contact', label: '연락처' },
    { value: 'remarks', label: '비고' },
  ];

  const handleSearch = () => {
    setActiveSearchTerm(searchTerm);
    setActiveSearchColumn(searchColumn);
    setCurrentPage(1); // Reset to first page on new search
  };

  const handleSearchInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <Card className="min-h-[calc(100vh-10rem)]">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle>문의 내역</CardTitle>
            <CardDescription>
              {isAdmin ? "모든 사용자의 문의 내역입니다." : null}
            </CardDescription>
          </div>
          <Button onClick={() => setIsInquiryModalOpen(true)} className="flex items-center gap-2 w-full md:w-auto">
            <PlusCircle className="h-5 w-5" />
            <span className="relative top-[-1px]">문의 접수</span>
          </Button>
        </CardHeader>
        
        {isLoadingInquiries ? (
          <div className="space-y-6 p-6">
            {/* Skeleton for filters and table */}
            <div className="flex flex-col md:flex-row gap-4">
              <Skeleton className="h-10 w-full md:w-60" />
              <Skeleton className="h-10 w-full md:w-40" />
              <Skeleton className="h-10 w-full md:flex-1" />
              <Skeleton className="h-10 w-24" />
            </div>
            <div className="flex flex-col md:flex-row gap-4 items-center">
                <Skeleton className="h-10 w-full md:w-auto md:flex-grow" />
            </div>
            <Skeleton className="h-10 w-full" /> 
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={mainContentVariants}
          >
            <CardContent className="pt-6">
              {/* Filter and Search UI */}
              <div className="mb-6 space-y-4">
                {/* Date Range Picker and Search Input Row */}
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                    {/* Date Picker 삭제 */}
                    {/* Search Column Select and Search Input */}
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:flex-1">
                        <Select value={searchColumn} onValueChange={setSearchColumn}>
                            <SelectTrigger className="w-full sm:w-[150px]">
                                <SelectValue placeholder="검색 열 선택" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">전체</SelectItem>
                                <SelectItem value="campaignKey">캠페인 키</SelectItem>
                                <SelectItem value="campaignName">캠페인 명</SelectItem>
                                <SelectItem value="adidOrIdfa">ADID/IDFA</SelectItem>
                                <SelectItem value="userName">이름</SelectItem>
                                <SelectItem value="contact">연락처</SelectItem>
                                <SelectItem value="remarks">비고</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            type="text"
                            placeholder="검색어를 입력하세요..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={handleSearchInputKeyDown}
                            className="flex-1 bg-white"
                        />
                    </div>
                     <Button 
                       onClick={handleSearch} 
                       className="w-full md:w-auto bg-white text-foreground hover:bg-gray-100 border border-input"
                     >
                        검색
                    </Button>
                </div>

                {/* Bulk Actions (Admin only) */}
                {isAdmin && selectedRows.size > 0 && (
                  <div className="flex flex-col sm:flex-row gap-2 items-center p-3 bg-muted/50 rounded-md">
                    <p className="text-sm font-medium">{selectedRows.size}개 항목 선택됨</p>
                    <Select value={bulkStatus} onValueChange={setBulkStatus}>
                        <SelectTrigger className="w-full sm:w-[180px] h-9">
                            <SelectValue placeholder="상태 일괄 변경" />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUS_OPTIONS_KOREAN.map(status => (
                                <SelectItem key={status} value={status}>{status}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={handleBulkStatusUpdate} disabled={!bulkStatus || isBulkUpdating} size="sm">
                        {isBulkUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        일괄 적용
                    </Button>
                  </div>
                )}
              </div>

              {/* Table for Submitted Inquiries */}
              <div className="relative">
                <AnimatePresence mode="wait" custom={animationDirection}>
                  {paginatedDataRows.length === 0 && !isLoadingInquiries && (!activeSearchTerm || filteredDataRows.length === 0) ? (
                    <motion.div
                      key="no-results"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                      className="text-center py-12 text-muted-foreground absolute w-full"
                    >
                      <FilterX className="mx-auto h-12 w-12 mb-4" />
                      <p className="text-lg font-semibold">검색 결과가 없습니다.</p>
                      <p className="text-sm">다른 검색어나 필터를 시도해 보세요.</p>
                    </motion.div>
                  ) : paginatedDataRows.length > 0 ? (
                    <motion.div
                      key={`table-${currentPage}`}
                      custom={animationDirection}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      variants={tableAnimationVariants}
                      className="overflow-x-auto"
                    >
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
                            <TableHead className="w-[100px] py-2 px-3 text-left">접수일</TableHead>
                            <TableHead className="w-[150px] py-2 px-3 text-left">캠페인 키</TableHead>
                            <TableHead className="w-[200px] py-2 px-3 text-left">캠페인 명</TableHead>
                            <TableHead className="w-[150px] py-2 px-3 text-left">ADID/IDFA</TableHead>
                            <TableHead className="w-[100px] py-2 px-3 text-left">이름</TableHead>
                            <TableHead className="w-[120px] py-2 px-3 text-left">연락처</TableHead>
                            <TableHead className="w-[150px] py-2 px-3 text-left">비고</TableHead>
                            <TableHead className="w-[100px] py-2 px-3 text-left">상태</TableHead>
                            <TableHead className="w-[200px] py-2 px-3 text-left">처리 결과</TableHead>
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
                              <TableCell className="w-[100px] py-2 px-3 text-left">{row.originalInquirySubmittedAt ? format(new Date(row.originalInquirySubmittedAt), "yyyy-MM-dd") : 'N/A'}</TableCell>
                              <TableCell className="w-[150px] py-2 px-3 text-left truncate">{row.campaignKey}</TableCell>
                              <TableCell className="w-[200px] py-2 px-3 text-left truncate">{row.campaignName}</TableCell>
                              <TableCell className="w-[150px] py-2 px-3 text-left truncate">{row.adidOrIdfa}</TableCell>
                              <TableCell className="w-[100px] py-2 px-3 text-left truncate">{row.userName}</TableCell>
                              <TableCell className="w-[120px] py-2 px-3 text-left truncate">{row.contact}</TableCell>
                              <TableCell className="w-[150px] py-2 px-3 text-left">{row.remarks}</TableCell>
                              <TableCell className="w-[100px] py-2 px-3 text-left">{renderStatusBadge(row.status)}</TableCell>
                              <TableCell className="w-[200px] py-2 px-3 text-left">{row.result || '-'}</TableCell>
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
                                          <div className="p-2 space-y-2">
                                            <DropdownMenuRadioGroup
                                                value={row.status}
                                                onValueChange={(newStatus) => {
                                                  const result = prompt('처리 결과 내용을 입력해주세요 (선택사항):', row.result || '');
                                                  if (result !== null) { // Only proceed if user didn't cancel
                                                    handleIndividualStatusChange(
                                                      row.originalInquiryId, 
                                                      row.originalDataRowIndex, 
                                                      newStatus,
                                                      result
                                                    );
                                                  }
                                                }}
                                            >
                                              {STATUS_OPTIONS_KOREAN.map(statusOption => (
                                                  <DropdownMenuRadioItem key={statusOption} value={statusOption}>
                                                      {statusOption}
                                                  </DropdownMenuRadioItem>
                                              ))}
                                            </DropdownMenuRadioGroup>
                                            <div className="text-xs text-muted-foreground p-2">
                                              상태 변경 시 결과 내용을 입력할 수 있습니다.
                                            </div>
                                          </div>
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
                    </motion.div>
                  ) : (
                    <div key="placeholder" className="min-h-[300px]"></div>
                  )}
                </AnimatePresence>
              </div>

              {/* Pagination (conditionally rendered) */}
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
            </CardContent>
          </motion.div>
        )}
      </Card>

      {/* Inquiry Modal */}
      <InquiryModal open={isInquiryModalOpen} onOpenChange={setIsInquiryModalOpen} />
    </div>
  );
}
