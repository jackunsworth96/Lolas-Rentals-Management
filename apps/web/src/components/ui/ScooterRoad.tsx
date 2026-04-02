/** Use `road.gif` when added under Original Assests; `road.svg` is the fallback until then. */
import roadGif from '../../assets/Original Assests/road.svg';
import scooter from '../../assets/Lola Scooter.svg';

export default function ScooterRoad() {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: '220px', marginTop: '-20px' }}
    >
      <img
        src={roadGif}
        alt=""
        aria-hidden
        className="pointer-events-none absolute bottom-0 w-full select-none object-cover object-bottom"
        style={{ height: '220px' }}
      />
      <img
        src={scooter}
        alt="Lola riding a scooter"
        className="absolute"
        style={{
          width: '120px',
          bottom: '60px',
          animation: 'scooterDrive 10s linear infinite',
        }}
      />
    </div>
  );
}
