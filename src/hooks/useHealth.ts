import { useEffect, useState } from "react";
import { HEALTH_POLL_MS } from "../config/constants";
import { api } from "../lib/api";
import type { Health } from "../types";

const UNREACHABLE: Health = {
  azure: { ok: false, error: "Server cavab vermir", region: null },
  claude: { ok: false, error: "Server cavab vermir", model: "" },
};

/** Polls the server for Azure/Claude configuration status. `null` while the first check runs. */
export function useHealth(): Health | null {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      api
        .health()
        .catch(() => UNREACHABLE)
        .then((result) => !cancelled && setHealth(result));

    void check();
    const timer = setInterval(check, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return health;
}
