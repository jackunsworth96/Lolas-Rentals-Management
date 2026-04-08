import type { RenterInfo } from './basket-types.js';

const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia',
  'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados',
  'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina',
  'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia',
  'Cameroon', 'Canada', 'Cape Verde', 'Central African Republic', 'Chad', 'Chile',
  'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus',
  'Czech Republic', 'Denmark', 'Djibouti', 'Dominican Republic', 'Ecuador', 'Egypt',
  'El Salvador', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland', 'France',
  'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Guatemala', 'Guinea',
  'Guyana', 'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran',
  'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan',
  'Kenya', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia',
  'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi',
  'Malaysia', 'Maldives', 'Mali', 'Malta', 'Mauritania', 'Mauritius', 'Mexico',
  'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria',
  'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palestine', 'Panama',
  'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar',
  'Romania', 'Russia', 'Rwanda', 'Saudi Arabia', 'Senegal', 'Serbia', 'Sierra Leone',
  'Singapore', 'Slovakia', 'Slovenia', 'Somalia', 'South Africa', 'South Korea', 'Spain',
  'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan',
  'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Trinidad and Tobago', 'Tunisia',
  'Turkey', 'Turkmenistan', 'Uganda', 'Ukraine', 'United Arab Emirates',
  'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Venezuela', 'Vietnam',
  'Yemen', 'Zambia', 'Zimbabwe',
];

interface Props {
  info: RenterInfo;
  onChange: (info: RenterInfo) => void;
  errors: Record<string, string>;
}

const INPUT_CLS =
  'h-10 w-full rounded-lg border border-charcoal-brand/[0.15] bg-white px-3 text-[13px] text-charcoal-brand placeholder:text-charcoal-brand/30 focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand transition-colors';
const LABEL_CLS = 'mb-1.5 block text-[11px] font-medium uppercase tracking-widest text-charcoal-brand/50';

export function RenterDetailsForm({ info, onChange, errors }: Props) {
  function update(field: keyof RenterInfo, value: string) {
    onChange({ ...info, [field]: value });
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <label className={LABEL_CLS}>Full Name</label>
        <input
          type="text"
          value={info.fullName}
          onChange={(e) => update('fullName', e.target.value)}
          placeholder="John Doe"
          autoComplete="name"
          className={`${INPUT_CLS} ${errors.fullName ? 'border-red-400 ring-1 ring-red-400' : ''}`}
        />
        {errors.fullName && <p className="mt-1 text-[11px] text-red-500">{errors.fullName}</p>}
      </div>

      <div>
        <label className={LABEL_CLS}>Email Address</label>
        <input
          type="email"
          value={info.email}
          onChange={(e) => update('email', e.target.value)}
          placeholder="john@example.com"
          autoComplete="email"
          className={`${INPUT_CLS} ${errors.email ? 'border-red-400 ring-1 ring-red-400' : ''}`}
        />
        {errors.email && <p className="mt-1 text-[11px] text-red-500">{errors.email}</p>}
      </div>

      <div>
        <label className={LABEL_CLS}>Phone Number</label>
        <input
          type="tel"
          value={info.phone}
          onChange={(e) => update('phone', e.target.value)}
          placeholder="+63 9XX XXX XXXX"
          autoComplete="tel"
          className={`${INPUT_CLS} ${errors.phone ? 'border-red-400 ring-1 ring-red-400' : ''}`}
        />
        {errors.phone && <p className="mt-1 text-[11px] text-red-500">{errors.phone}</p>}
      </div>

      <div>
        <label className={LABEL_CLS}>Nationality</label>
        <div className="relative">
          <select
            value={info.nationality}
            onChange={(e) => update('nationality', e.target.value)}
            autoComplete="country-name"
            className={`${INPUT_CLS} appearance-none pr-8 ${errors.nationality ? 'border-red-400 ring-1 ring-red-400' : ''}`}
          >
            <option value="">Select Country</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-charcoal-brand/40">▾</span>
        </div>
        {errors.nationality && (
          <p className="mt-1 text-[11px] text-red-500">{errors.nationality}</p>
        )}
      </div>
    </div>
  );
}
