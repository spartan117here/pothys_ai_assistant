import { useQuery } from '@tanstack/react-query';
import apiClient from '../services/api';

export interface BranchStatus {
  id: string;
  name: string;
  code: string;
  monthly_sales_target: number;
  status: 'SUBMITTED' | 'PENDING';
  report: {
    id: string;
    sales_amount: number;
    attendance_count: number;
    target_achievement: number;
    inventory_status: string | null;
    remarks: string | null;
    issues: string | null;
    original_file_url: string | null;
  } | null;
}

export interface BranchAnalytics {
  branch: {
    id: string;
    name: string;
    code: string;
    monthly_sales_target: number;
  };
  summary: {
    total_sales: number;
    average_attendance: number;
    average_target_achievement: number;
    reports_count: number;
    issues_count: number;
  };
  trends: Array<{
    date: string;
    sales_amount: number;
    attendance_count: number;
    target_achievement: number;
  }>;
  recent_issues: Array<{
    date: string;
    manager: string;
    issues: string;
  }>;
}

export interface DashboardSummary {
  total_revenue: number;
  digigold_enrollments: number;
  digisilver_enrollments: number;
  employees_present: number;
  employees_absent: number;
  complaints_count: number;
  top_performing_branch: string;
  top_performing_employee: string;
  complaints: string[];
}

export function useBranchesDashboard(reportDate?: string) {
  return useQuery<BranchStatus[]>({
    queryKey: ['branches-dashboard', reportDate],
    queryFn: async () => {
      const url = reportDate ? `/branches?report_date=${reportDate}` : '/branches';
      const res = await apiClient.get(url);
      return res.data;
    },
    refetchInterval: 60000, // auto-refresh dashboard data every 60s
  });
}

export function useDashboardSummary(reportDate?: string) {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary', reportDate],
    queryFn: async () => {
      const url = reportDate ? `/branches/dashboard-summary?report_date=${reportDate}` : '/branches/dashboard-summary';
      const res = await apiClient.get(url);
      return res.data;
    },
    refetchInterval: 60000,
  });
}

export function useBranchAnalytics(branchId: string, startDate?: string, endDate?: string) {
  return useQuery<BranchAnalytics>({
    queryKey: ['branch-analytics', branchId, startDate, endDate],
    queryFn: async () => {
      let url = `/branches/${branchId}/analytics`;
      const params = [];
      if (startDate) params.push(`start_date=${startDate}`);
      if (endDate) params.push(`end_date=${endDate}`);
      if (params.length) url += `?${params.join('&')}`;
      
      const res = await apiClient.get(url);
      return res.data;
    },
    enabled: !!branchId,
  });
}
