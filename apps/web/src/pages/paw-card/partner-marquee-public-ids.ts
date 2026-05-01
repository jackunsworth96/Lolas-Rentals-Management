/**
 * Ordered Cloudinary public IDs for Paw Card partner marquees (login page + partners).
 * Duplicate brand artwork (e.g. Big Mama Laundry vs Laundry Café, Happiness venues) is
 * spaced apart so they are unlikely to appear side-by-side while scrolling.
 *
 * Outer Cafe: the default public ID comes from the historical migration. If the image
 * 404s in Cloudinary, upload the logo to cloud `dk3c78pro`, then set `VITE_OUTER_CAFE_LOGO_ID`
 * in Vercel / `apps/web/.env` to that asset’s Public ID, and update
 * `paw_card_establishments.cloudinary_public_id` for Outer Cafe so partner cards match.
 */
export function outerCafeMarqueePublicId(): string {
  const v = import.meta.env.VITE_OUTER_CAFE_LOGO_ID as string | undefined;
  return v != null && String(v).trim() !== '' ? String(v).trim() : 'outer-cafe_2_zxrcnb';
}

/** Prefer env override for Outer Cafe partner rows when name matches (DB may still point at a dead Cloudinary id). */
export function resolveEstablishmentCloudinaryId(
  cloudinaryPublicId: string | null | undefined,
  establishmentName: string,
): string | null {
  const v = import.meta.env.VITE_OUTER_CAFE_LOGO_ID as string | undefined;
  const envId = v != null && String(v).trim() !== '' ? String(v).trim() : null;
  if (envId && /outer\s*cafe/i.test(establishmentName)) return envId;
  return cloudinaryPublicId ?? null;
}

export const PARTNER_MARQUEE_CLOUDINARY_IDS: readonly string[] = [
  'amon_vn1zcu',
  'aruga-wellness-spa_ke20rl',
  'asgard_h2puqu',
  'backside-burger_aagq80',
  'bamboo-surf-caf_hkgoke',
  'bar-ciao_lqt3wf',
  'basta_pm5vm5',
  'bawud-t-s_w1z7es',
  'big-mama-laundry_slkpcf',
  'b-nay_fct2ja',
  'boost-shop_risksa',
  'brunch-spot_pnqkuu',
  'cat-gun_d1qpdf',
  'coastal-grounds_jicvyc',
  'cocopelli_tp590y',
  'cumin_mmhogw',
  'dao-chow_esghhl',
  'e-foil-siargao_bh2kzv',
  'el-chapo-s_f8ckvp',
  'eskate-siargao_yh33d8',
  'fin-fin_t20ars',
  'food-lab_vazpsf',
  'goodies_jbevlu',
  'good-times-coffee_wfb4o8',
  'grwnd_b27ero',
  'gwapitos_ax0ks1',
  'haole_osupjy',
  'happiness-beach-bar_wlld8k',
  'happy-islanders_pvtdp7',
  'kanaloa_cmcicx',
  'kanin-baboy_c6hs0k',
  'kolekbibo_x9yf58',
  'kudo-surf_tmmw0f',
  'la-mesa_gbii20',
  'las-barricas_sakc8e',
  'lokal-experience_d1qbgy',
  'lokal-hub_lwwy8d',
  'love-coco_e5kfqa',
  'low-tide_elw0bl',
  'lunares_jnq4ss',
  'manu_umjgcu',
  'mao-mao-surf_egcehp',
  'marmalade_fjvvlh',
  'masala_lms9sn',
  'mujo_sj7uxv',
  'nattribu_npmuhy',
  'noods_sclb7x',
  'oeyart-tattoo-studio_roxujo',
  outerCafeMarqueePublicId(),
  'ozen-freediving_twgsu5',
  'padel-palms_mihcws',
  'prime-fit-gym_jaskbe',
  'saint-thomas-coffee_wbwt7y',
  'sanabowl_zyf7te',
  'secreto_lurv7d',
  'shado-surf_likdyi',
  'shanti-shanty_mwymra',
  'siago-beach-resort_kzo0ay',
  'siargao-bed-and-brew_szggh5',
  'siargao-hawker_rawz7p',
  'siargao-wakepark_h6uevd',
  'sibol_hgdc4c',
  'sunset-coffee-roasters_ame9ry',
  'taw-hay-fitness_pu7ues',
  'the-extension_xd5ape',
  'the-phone-hospital_yyalhd',
  'tiburon_gw1lmg',
  'tiki-hut_kfjwtq',
  'ver-de_kumi9x',
  'vissla_nck7yj',
  'wild_jdp8xg',
  'x-pizza_qdwcka',
  'yogi_mcpzyn',
  'big-mama-laundry-caf_dpioh4',
  'happiness-restro_zc5vh6',
  'yoh_qbytxc',
];
