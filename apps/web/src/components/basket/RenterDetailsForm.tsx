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

const inputBase =
  'w-full rounded-2xl border-none bg-sand-brand p-4 font-bold text-charcoal-brand shadow-inner placeholder:text-charcoal-brand/30 transition-all duration-200 focus:scale-[1.01] focus:bg-white focus:ring-2 focus:ring-teal-brand';

export function RenterDetailsForm({ info, onChange, errors }: Props) {
  function update(field: keyof RenterInfo, value: string) {
    onChange({ ...info, [field]: value });
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="space-y-2">
        <label className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-teal-brand">
          Full Name
        </label>
        <input
          type="text"
          value={info.fullName}
          onChange={(e) => update('fullName', e.target.value)}
          placeholder="John Doe"
          autoComplete="name"
          className={`${inputBase} ${errors.fullName ? 'ring-2 ring-red-400' : ''}`}
        />
        {errors.fullName && <p className="ml-1 text-xs text-red-500">{errors.fullName}</p>}
      </div>

      <div className="space-y-2">
        <label className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-teal-brand">
          Email Address
        </label>
        <input
          type="email"
          value={info.email}
          onChange={(e) => update('email', e.target.value)}
          placeholder="john@example.com"
          autoComplete="email"
          className={`${inputBase} ${errors.email ? 'ring-2 ring-red-400' : ''}`}
        />
        {errors.email && <p className="ml-1 text-xs text-red-500">{errors.email}</p>}
      </div>

      <div className="space-y-2">
        <label className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-teal-brand">
          Phone Number
        </label>
        <input
          type="tel"
          value={info.phone}
          onChange={(e) => update('phone', e.target.value)}
          placeholder="+63 9XX XXX XXXX"
          autoComplete="tel"
          className={`${inputBase} ${errors.phone ? 'ring-2 ring-red-400' : ''}`}
        />
        {errors.phone && <p className="ml-1 text-xs text-red-500">{errors.phone}</p>}
      </div>

      <div className="space-y-2">
        <label className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-teal-brand">
          Nationality
        </label>
        <div className="relative">
          <select
            value={info.nationality}
            onChange={(e) => update('nationality', e.target.value)}
            autoComplete="country-name"
            className={`${inputBase} appearance-none ${errors.nationality ? 'ring-2 ring-red-400' : ''}`}
          >
            <option value="">Select Country</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-charcoal-brand/40">
            ▾
          </span>
        </div>
        {errors.nationality && (
          <p className="ml-1 text-xs text-red-500">{errors.nationality}</p>
        )}
      </div>
    </div>
  );
}
