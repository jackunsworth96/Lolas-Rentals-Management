import { useState, useEffect } from 'react';
import CountUp from './CountUp.js';

const FALLBACK_TOTAL = 282995;
const PUBLIC_ENDPOINT = '/api/public/booking/charity-impact';

interface CharityImpact {
  totalRaised: number;
}

export default function BePawsitiveMeter() {
  const [total, setTotal] = useState<number>(FALLBACK_TOTAL);

  useEffect(() => {
    let cancelled = false;
    fetch(PUBLIC_ENDPOINT)
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: CharityImpact }) => {
        if (!cancelled && json?.data?.totalRaised != null) {
          setTotal(json.data.totalRaised);
        }
      })
      .catch(() => {
        // silently fall back to hardcoded value
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CountUp
      from={0}
      to={total}
      separator=","
      direction="up"
      duration={2}
      startWhen={true}
      className="count-up-text"
    />
  );
}
