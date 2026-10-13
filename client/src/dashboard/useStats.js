import { useCallback, useEffect, useRef, useState } from 'react';

import { getStatsDaily, getStatsHeatmap, getStatsRanking, getStatsSummary, getStatsWeekday } from '../api.js';

// Charge une ressource ; chaque bloc du dashboard a son propre état (chargement / erreur / données).
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const reqId = useRef(0);
  // `deps` pilote la stabilité du loader (le loader inline change à chaque rendu).
  const run = useCallback(loader, deps);

  const reload = useCallback(() => {
    const id = ++reqId.current;
    // On vide les données précédentes : un changement de paramètre (ex. année) ne doit pas afficher l'ancien résultat.
    setState({ data: null, error: null, loading: true });
    run()
      .then((data) => {
        if (id === reqId.current) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (id === reqId.current) setState({ data: null, error, loading: false });
      });
  }, [run]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

export const useSummary = () => useAsync(getStatsSummary, []);
export const useHeatmap = (year) => useAsync(() => getStatsHeatmap(year), [year]);
export const useDaily = (days = 30) => useAsync(() => getStatsDaily(days), [days]);
export const useWeekday = (weeks = 12) => useAsync(() => getStatsWeekday(weeks), [weeks]);
export const useRanking = (days = 30) => useAsync(() => getStatsRanking(days), [days]);
