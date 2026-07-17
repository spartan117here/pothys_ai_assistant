import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../services/api';

export interface PendingReport {
  branch_id: string;
  branch_name: string;
  branch_code: string;
  missing_date: string;
}

export interface UploadReportPayload {
  report_date: string;
  sales_amount?: number;
  attendance_count?: number;
  target_achievement?: number;
  inventory_status?: string;
  remarks?: string;
  issues?: string;
  file?: {
    uri: string;
    name: string;
    type: string;
  };
}

export function usePendingReports(reportDate?: string) {
  return useQuery<PendingReport[]>({
    queryKey: ['pending-reports', reportDate],
    queryFn: async () => {
      const url = reportDate ? `/reports/pending?report_date=${reportDate}` : '/reports/pending';
      const res = await apiClient.get(url);
      return res.data;
    },
  });
}

export function useUploadReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UploadReportPayload) => {
      // Build FormData for multipart request
      const formData = new FormData();
      formData.append('report_date', payload.report_date);
      
      if (payload.sales_amount !== undefined) formData.append('sales_amount', String(payload.sales_amount));
      if (payload.attendance_count !== undefined) formData.append('attendance_count', String(payload.attendance_count));
      if (payload.target_achievement !== undefined) formData.append('target_achievement', String(payload.target_achievement));
      if (payload.inventory_status) formData.append('inventory_status', payload.inventory_status);
      if (payload.remarks) formData.append('remarks', payload.remarks);
      if (payload.issues) formData.append('issues', payload.issues);
      
      if (payload.file) {
        // React Native FormData expects an object representation of the file
        formData.append('file', {
          uri: payload.file.uri,
          name: payload.file.name,
          type: payload.file.type,
        } as any);
      }

      const res = await apiClient.post('/reports/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return res.data;
    },
    onSuccess: () => {
      // Refresh dashboard caches on successful reports submissions
      queryClient.invalidateQueries({ queryKey: ['branches-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pending-reports'] });
    },
  });
}
