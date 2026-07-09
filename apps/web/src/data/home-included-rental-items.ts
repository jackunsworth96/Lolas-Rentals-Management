import iconHelmet from '../assets/Home/Helmet Icon.svg';
import iconFuel from '../assets/Home/Fuel Icon.svg';
import iconPawCard from '../assets/Home/Paw Card Icon.svg';
import iconCoat from '../assets/Home/Coat Icon.svg';
import iconFirstAid from '../assets/Home/First Aid Icon.svg';
import iconRepairKit from '../assets/Home/Repair Kit Icon.svg';
import iconCloth from '../assets/Home/Cloth Icon.svg';
import iconPeaceOfMind from '../assets/Home/Peace of Mind.svg';
import iconPhoneMount from '../assets/Home/Phone Mount Icon.svg';
import iconDryBag from '../assets/Home/Dry Bag Icon.svg';
import iconLesson from '../assets/Home/Lesson Icon.svg';

export type IncludedRentalItem = { icon: string; label: string };

/** Honda Beat / scooter inclusions */
export const BEAT_INCLUDED_ITEMS: IncludedRentalItem[] = [
  { icon: iconHelmet,     label: 'Helmet' },
  { icon: iconFuel,       label: 'Full Tank' },
  { icon: iconPawCard,    label: 'Paw Card' },
  { icon: iconCoat,       label: 'Rain Coat' },
  { icon: iconFirstAid,   label: 'First Aid' },
  { icon: iconRepairKit,  label: 'Repair Kit' },
  { icon: iconPhoneMount, label: 'Phone Mount' },
  { icon: iconDryBag,     label: '5L Dry Bag' },
];

/** TukTuk inclusions */
export const TUKTUK_INCLUDED_ITEMS: IncludedRentalItem[] = [
  { icon: iconCoat,       label: 'Rain Coat' },
  { icon: iconCloth,      label: 'Seat Cloth' },
  { icon: iconPawCard,    label: 'Paw Card' },
  { icon: iconFuel,       label: 'Full Tank' },
  { icon: iconFirstAid,   label: 'First Aid' },
  { icon: iconPhoneMount, label: 'Phone Mount' },
  { icon: iconLesson,     label: 'Lesson' },
  { icon: iconDryBag,     label: '5L Dry Bag' },
];

/** Fallback generic set (used on homepage marquee etc.) */
export const HOME_INCLUDED_RENTAL_ITEMS: IncludedRentalItem[] = BEAT_INCLUDED_ITEMS;

/** Returns the correct inclusion list for a given model name. */
export function getIncludedItemsForModel(modelName: string): IncludedRentalItem[] {
  const lower = modelName.toLowerCase();
  if (lower.includes('tuktuk') || lower.includes('tuk-tuk') || lower.includes('tuk tuk')) {
    return TUKTUK_INCLUDED_ITEMS;
  }
  return BEAT_INCLUDED_ITEMS;
}

/** Optional add-ons shown on the reserve page alongside the included set. */
export const HOME_OPTIONAL_ADDON_ITEMS: IncludedRentalItem[] = [
  { icon: iconPeaceOfMind, label: 'Damage Protection' },
  { icon: iconDryBag,      label: '5L Dry Bag' },
];
