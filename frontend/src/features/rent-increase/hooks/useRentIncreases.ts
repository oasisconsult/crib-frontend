import { useCallback, useEffect, useState } from "react";
import { rentIncreaseApi } from "../api";
import type { RentIncrease, RentIncreaseCreate, RentIncreaseWithdraw } from "../types";

interface State {
  data: RentIncrease[];
  loading: boolean;
  error: string | null;
}

export function useRentIncreases(leaseId: string) {
  const [state, setState] = useState<State>({ data: [], loading: true, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await rentIncreaseApi.list(leaseId);
      setState({ data: res.data, loading: false, error: null });
    } catch (err: unknown) {
      setState({ data: [], loading: false, error: err instanceof Error ? err.message : "Failed to load" });
    }
  }, [leaseId]);

  useEffect(() => { load(); }, [load]);

  const create = async (body: RentIncreaseCreate): Promise<RentIncrease> => {
    const created = await rentIncreaseApi.create(leaseId, body);
    await load();
    return created;
  };

  const acknowledge = async (increaseId: string): Promise<void> => {
    await rentIncreaseApi.acknowledge(leaseId, increaseId);
    await load();
  };

  const withdraw = async (increaseId: string, body: RentIncreaseWithdraw): Promise<void> => {
    await rentIncreaseApi.withdraw(leaseId, increaseId, body);
    await load();
  };

  return { ...state, reload: load, create, acknowledge, withdraw };
}
