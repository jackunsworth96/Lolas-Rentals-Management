/**
 * Maps ITU country calling codes (without +) to nationality labels matching RenterDetailsForm `COUNTRIES`.
 * Longest-prefix wins. Ambiguous codes (+1 NANP, +7 RU/KZ) use a single sensible default.
 */
const CALLING_CODE_TO_NATIONALITY: Record<string, string> = {
  // —— High traffic / Siargao-adjacent ——
  '63': 'Philippines',
  '61': 'Australia',
  '64': 'New Zealand',
  '65': 'Singapore',
  '60': 'Malaysia',
  '66': 'Thailand',
  '84': 'Vietnam',
  '62': 'Indonesia',
  '886': 'Taiwan',
  '852': 'China',
  '853': 'China',
  '81': 'Japan',
  '82': 'South Korea',
  '86': 'China',
  '91': 'India',
  '92': 'Pakistan',
  '94': 'Sri Lanka',
  '880': 'Bangladesh',
  '977': 'Nepal',
  '975': 'Bhutan',
  '93': 'Afghanistan',
  '98': 'Iran',
  '964': 'Iraq',
  '972': 'Israel',
  '961': 'Lebanon',
  '962': 'Jordan',
  '965': 'Kuwait',
  '966': 'Saudi Arabia',
  '968': 'Oman',
  '971': 'United Arab Emirates',
  '974': 'Qatar',
  '973': 'Bahrain',
  '970': 'Palestine',
  '90': 'Turkey',
  '998': 'Uzbekistan',
  '996': 'Kyrgyzstan',
  '992': 'Tajikistan',
  '993': 'Turkmenistan',
  '994': 'Azerbaijan',
  '374': 'Armenia',
  '995': 'Georgia',
  '856': 'Laos',
  '855': 'Cambodia',
  '95': 'Myanmar',
  '673': 'Brunei',
  '7': 'Russia',
  // —— Europe ——
  '44': 'United Kingdom',
  '353': 'Ireland',
  '33': 'France',
  '49': 'Germany',
  '39': 'Italy',
  '34': 'Spain',
  '351': 'Portugal',
  '31': 'Netherlands',
  '32': 'Belgium',
  '41': 'Switzerland',
  '43': 'Austria',
  '45': 'Denmark',
  '46': 'Sweden',
  '47': 'Norway',
  '358': 'Finland',
  '48': 'Poland',
  '420': 'Czech Republic',
  '36': 'Hungary',
  '40': 'Romania',
  '359': 'Bulgaria',
  '385': 'Croatia',
  '386': 'Slovenia',
  '421': 'Slovakia',
  '372': 'Estonia',
  '371': 'Latvia',
  '370': 'Lithuania',
  '30': 'Greece',
  '357': 'Cyprus',
  '356': 'Malta',
  '352': 'Luxembourg',
  '354': 'Iceland',
  '380': 'Ukraine',
  '375': 'Belarus',
  '373': 'Moldova',
  // —— Americas ——
  '1': 'United States',
  '52': 'Mexico',
  '54': 'Argentina',
  '55': 'Brazil',
  '56': 'Chile',
  '57': 'Colombia',
  '51': 'Peru',
  '58': 'Venezuela',
  '593': 'Ecuador',
  '595': 'Paraguay',
  '598': 'Uruguay',
  '591': 'Bolivia',
  // —— Africa & other ——
  '27': 'South Africa',
  '20': 'Egypt',
  '212': 'Morocco',
  '213': 'Algeria',
  '216': 'Tunisia',
  '234': 'Nigeria',
  '254': 'Kenya',
  '255': 'Tanzania',
  '256': 'Uganda',
  '250': 'Rwanda',
  '233': 'Ghana',
  '221': 'Senegal',
  '260': 'Zambia',
  '263': 'Zimbabwe',
};

const SORTED_CODES = Object.keys(CALLING_CODE_TO_NATIONALITY).sort((a, b) => b.length - a.length);

/**
 * Returns a nationality label matching `COUNTRIES` when input looks like E.164 (+country…).
 */
export function inferNationalityFromPhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed.startsWith('+')) return null;
  const digits = trimmed.slice(1).replace(/\D/g, '');
  if (!digits) return null;

  for (const code of SORTED_CODES) {
    if (digits.startsWith(code)) {
      return CALLING_CODE_TO_NATIONALITY[code] ?? null;
    }
  }
  return null;
}
