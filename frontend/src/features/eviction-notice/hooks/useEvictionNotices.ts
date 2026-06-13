import { useCallback, useEffect, useState } from "react";
import { evictionNoticeApi } from "../api";
import type { EvictionNotice, EvictionNoticeCreate } from "../types";

interface State {
  data: EvictionNotice[];
  loading: boolean;
  error: string | null;
}

export function useEvictionNotices(leaseId: string) {
  const [state, setState] = useState<State>({ data: [], loading: true, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await evictionNoticeApi.list(leaseId);
      setState({ data: res.data, loading: false, error: null });
    } catch (err: unknown) {
      setState({
        data: [],
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load",
      });
    }
  }, [leaseId]);

  useEffect(() => { load(); }, [load]);

  const create = async (body: EvictionNoticeCreate): Promise<EvictionNotice> => {
    const created = await evictionNoticeApi.create(leaseId, body);
    await load();
    return created;
  };

  const serve = async (noticeId: string): Promise<void> => {
    await evictionNoticeApi.serve(leaseId, noticeId);
    await load();
  };

  const dispute = async (noticeId: string, grounds?: string): Promise<void> => {
    await evictionNoticeApi.dispute(leaseId, noticeId, grounds);
    await load();
  };

  const withdraw = async (noticeId: string, reason?: string): Promise<void> => {
    await evictionNoticeApi.withdraw(leaseId, noticeId, reason);
    await load();
  };

  const execute = async (noticeId: string): Promise<void> => {
    await evictionNoticeApi.execute(leaseId, noticeId);
    await load();
  };

  return { ...state, reload: load, create, serve, dispute, withdraw, execute };
}
