-- Add featured image to the Be Pawsitive partnership article
update public.ngo_articles
set featured_image_url = 'https://res.cloudinary.com/dk3c78pro/image/upload/v1777266358/IMG_1095-Migliorato-NR_lngzkk.jpg'
where slug = 'our-partnership-with-be-pawsitive';
