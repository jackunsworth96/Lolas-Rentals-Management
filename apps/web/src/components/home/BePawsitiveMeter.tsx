import { useCharityImpact } from '../../api/impact.js';
import CountUp from './CountUp.js';

const FALLBACK_TOTAL = 325495;

export function NgoImpactMeter() {
  const { data } = useCharityImpact();
  const total = data?.totalRaised ?? FALLBACK_TOTAL;

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

/** @deprecated Use NgoImpactMeter */
export default NgoImpactMeter;
