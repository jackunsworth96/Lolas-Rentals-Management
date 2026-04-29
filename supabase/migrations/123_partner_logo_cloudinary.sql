-- Add Cloudinary public ID column to paw_card_establishments.
-- Public IDs match the Cloudinary asset stems uploaded to the account
-- (cloud: dk3c78pro). No folder prefix — stored exactly as shown in the
-- Cloudinary Media Library (e.g. "aruga-wellness-spa_ke20rl").

ALTER TABLE paw_card_establishments
  ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT;

-- Populate using slug-normalised name matching (mirrors toLogoLookupKey in
-- the frontend: lowercase → replace non-alphanumeric runs with hyphens →
-- trim leading/trailing hyphens).
WITH mapping (slug, public_id) AS (
  VALUES
    ('amon',                    'amon_vn1zcu'),
    ('aruga-wellness-spa',      'aruga-wellness-spa_ke20rl'),
    ('asgard',                  'asgard_h2puqu'),
    ('backside-burger',         'backside-burger_aagq80'),
    ('bamboo-surf-caf',         'bamboo-surf-caf_hkgoke'),
    ('bar-ciao',                'bar-ciao_lqt3wf'),
    ('basta',                   'basta_pm5vm5'),
    ('bawud-t-s',               'bawud-t-s_w1z7es'),
    ('big-mama-laundry',        'big-mama-laundry_slkpcf'),
    ('big-mama-laundry-caf',    'big-mama-laundry-caf_dpioh4'),
    ('b-nay',                   'b-nay_fct2ja'),
    ('boost-shop',              'boost-shop_risksa'),
    ('brunch-spot',             'brunch-spot_pnqkuu'),
    ('cat-gun',                 'cat-gun_d1qpdf'),
    ('coastal-grounds',         'coastal-grounds_jicvyc'),
    ('cocopelli',               'cocopelli_tp590y'),
    ('cumin',                   'cumin_mmhogw'),
    ('dao-chow',                'dao-chow_esghhl'),
    ('e-foil-siargao',          'e-foil-siargao_bh2kzv'),
    ('el-chapo-s',              'el-chapo-s_f8ckvp'),
    ('eskate-siargao',          'eskate-siargao_yh33d8'),
    ('fin-fin',                 'fin-fin_t20ars'),
    ('food-lab',                'food-lab_vazpsf'),
    ('goodies',                 'goodies_jbevlu'),
    ('good-times-coffee',       'good-times-coffee_wfb4o8'),
    ('grwnd',                   'grwnd_b27ero'),
    ('gwapitos',                'gwapitos_ax0ks1'),
    ('haole',                   'haole_osupjy'),
    ('happiness-beach-bar',     'happiness-beach-bar_wlld8k'),
    ('happiness-restro',        'happiness-restro_zc5vh6'),
    ('happy-islanders',         'happy-islanders_pvtdp7'),
    ('kanaloa',                 'kanaloa_cmcicx'),
    ('kanin-baboy',             'kanin-baboy_c6hs0k'),
    ('kolekbibo',               'kolekbibo_x9yf58'),
    ('kudo-surf',               'kudo-surf_tmmw0f'),
    ('la-mesa',                 'la-mesa_gbii20'),
    ('las-barricas',            'las-barricas_sakc8e'),
    ('lokal-experience',        'lokal-experience_d1qbgy'),
    ('lokal-hub',               'lokal-hub_lwwy8d'),
    ('love-coco',               'love-coco_e5kfqa'),
    ('low-tide',                'low-tide_elw0bl'),
    ('lunares',                 'lunares_jnq4ss'),
    ('manu',                    'manu_umjgcu'),
    ('mao-mao-surf',            'mao-mao-surf_egcehp'),
    ('marmalade',               'marmalade_fjvvlh'),
    ('masala',                  'masala_lms9sn'),
    ('mujo',                    'mujo_sj7uxv'),
    ('nattribu',                'nattribu_npmuhy'),
    ('noods',                   'noods_sclb7x'),
    ('oeyart-tattoo-studio',    'oeyart-tattoo-studio_roxujo'),
    ('outer-cafe',              'outer-cafe_ykizor'),
    ('ozen-freediving',         'ozen-freediving_twgsu5'),
    ('padel-palms',             'padel-palms_mihcws'),
    ('prime-fit-gym',           'prime-fit-gym_jaskbe'),
    ('saint-thomas-coffee',     'saint-thomas-coffee_wbwt7y'),
    ('sanabowl',                'sanabowl_zyf7te'),
    ('secreto',                 'secreto_lurv7d'),
    ('shado-surf',              'shado-surf_likdyi'),
    ('shanti-shanty',           'shanti-shanty_mwymra'),
    ('siago-beach-resort',      'siago-beach-resort_kzo0ay'),
    ('siargao-bed-and-brew',    'siargao-bed-and-brew_szggh5'),
    ('siargao-hawker',          'siargao-hawker_rawz7p'),
    ('siargao-wakepark',        'siargao-wakepark_h6uevd'),
    ('sibol',                   'sibol_hgdc4c'),
    ('sunset-coffee-roasters',  'sunset-coffee-roasters_ame9ry'),
    ('taw-hay-fitness',         'taw-hay-fitness_pu7ues'),
    ('the-extension',           'the-extension_xd5ape'),
    ('the-phone-hospital',      'the-phone-hospital_yyalhd'),
    ('tiburon',                 'tiburon_gw1lmg'),
    ('tiki-hut',                'tiki-hut_kfjwtq'),
    ('ver-de',                  'ver-de_kumi9x'),
    ('vissla',                  'vissla_nck7yj'),
    ('wild',                    'wild_jdp8xg'),
    ('x-pizza',                 'x-pizza_qdwcka'),
    ('yogi',                    'yogi_mcpzyn'),
    ('yoh',                     'yoh_qbytxc')
)
UPDATE paw_card_establishments AS e
SET    cloudinary_public_id = m.public_id
FROM   mapping m
WHERE  trim(both '-' from regexp_replace(lower(e.name), '[^a-z0-9]+', '-', 'g')) = m.slug
  AND  e.cloudinary_public_id IS NULL;
