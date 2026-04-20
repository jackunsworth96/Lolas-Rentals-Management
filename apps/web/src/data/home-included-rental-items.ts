/**
 * The six items every scooter rental includes — same subset as the homepage
 * "What's Included" marquee (before optional extras / phone mount / upgrades).
 */
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

export const HOME_INCLUDED_RENTAL_ITEMS: IncludedRentalItem[] = [
  { icon: iconHelmet, label: 'Helmet' },
  { icon: iconFuel, label: 'Full Tank' },
  { icon: iconPawCard, label: 'Paw Card' },
  { icon: iconCoat, label: 'Rain Coat' },
  { icon: iconFirstAid, label: 'First Aid' },
  { icon: iconRepairKit, label: 'Repair Kit' },
];

/** Five optional add-ons shown on the reserve page alongside the included set. */
export const HOME_OPTIONAL_ADDON_ITEMS: IncludedRentalItem[] = [
  { icon: iconCloth,        label: 'Seat Cloth' },
  { icon: iconPeaceOfMind,  label: 'Damage Protection' },
  { icon: iconPhoneMount,   label: 'Phone Mount' },
  { icon: iconDryBag,       label: '5L Dry Bag' },
  { icon: iconLesson,       label: 'Lesson' },
];
