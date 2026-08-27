'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson, qs } from '@/shared/api/http';

/** Metric definition from backend */
export interface MetricDef {
  key: string;
  window: string;
  unit: string;
  defaultOperator: 'lte' | 'gte';
  defaultThreshold: number;
}

/** Rule row from backend */
export interface RuleRow {
  id: string;
  metric: string;
  operator: 'lte' | 'gte';
  threshold: number;
  active: boolean;
}

/** Compliance row from backend */
export interface RuleCompliance {
  metric: string;
  operator: 'lte' | 'gte';
  threshold: number;
  window: string;
  followed: number;
  violated: number;
  unchecked: number;
  violatingIds: string[];
}

export interface UpsertRuleVars {
  metric: string;
  operator: 'lte' | 'gte';
  threshold: number;
  active?: boolean;
}

const RULES_KEY = ['rules'];
const RULES_COMPLIANCE_KEY = ['rulesCompliance'];

export const useRules = () =>
  useQuery({
    queryKey: RULES_KEY,
    queryFn: () =>
      apiJson<{ metrics: MetricDef[]; rules: RuleRow[] }>('/api/rules'),
    staleTime: 30000,
    retry: 1,
  });

export const useUpsertRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ metric, ...body }: UpsertRuleVars) =>
      apiJson<RuleRow>(`/api/rules/${metric}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: RULES_KEY });
      void qc.invalidateQueries({ queryKey: RULES_COMPLIANCE_KEY });
    },
  });
};

export const useDeleteRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (metric: string) =>
      apiJson(`/api/rules/${metric}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: RULES_KEY });
      void qc.invalidateQueries({ queryKey: RULES_COMPLIANCE_KEY });
    },
  });
};

export const useCompliance = (days?: number) =>
  useQuery({
    queryKey: [
      ...RULES_COMPLIANCE_KEY,
      days ?? 0,
    ],
    queryFn: () =>
      apiJson<{ rules: RuleCompliance[] }>(
        `/api/rules/compliance${qs({
          days: days || undefined,
          tz: new Date().getTimezoneOffset(),
        })}`,
      ),
    staleTime: 30000,
    retry: 1,
  });
